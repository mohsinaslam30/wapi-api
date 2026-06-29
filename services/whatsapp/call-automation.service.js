import { WhatsappCallAgent, WhatsappCallLog, WhatsappCallSetting, Contact, AIModel, WhatsappPhoneNumber } from '../../models/index.js';
import wrtcPkg from '@roamhq/wrtc';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import whatsappCallingService from './whatsapp-calling.service.js';
import webrtcService from './webrtc.service.js';
import opusscript from 'opusscript';


const callAudioBuffers = new Map();
const aiProcessingLocks = new Map();

class CallAutomationService {
    async handleCallWebhook(callData, phoneNumberId) {
        const { id: waCallId, from: contactNumber, event, session } = callData;

        try {
            let callLog = await WhatsappCallLog.findOne({ wa_call_id: waCallId });

            switch (event) {
                case 'connect':
                    if (session?.sdp_type === 'offer') {
                        if (callLog && callLog.status !== 'ringing') {
                            console.log(`[CallWebhook] Call ${waCallId} already answered (status: ${callLog.status}), ignoring duplicate.`);
                            return;
                        }

                        const { contact, agent } = await this.resolveContactAndAgent(contactNumber, phoneNumberId);

                        if (!agent) {
                            console.error(`No agent found for call ${waCallId}`);
                            await whatsappCallingService.terminateCall(phoneNumberId, waCallId);
                            return;
                        }

                        if (!callLog) {
                            callLog = await WhatsappCallLog.create({
                                user_id: agent.user_id,
                                contact_id: contact?._id,
                                phone_number_id: phoneNumberId,
                                agent_id: agent._id,
                                wa_call_id: waCallId,
                                status: 'ringing'
                            });
                        }

                        console.log(`Answering call ${waCallId} from ${contactNumber}`);
                        await whatsappCallingService.answerCall(phoneNumberId, waCallId, session.sdp, agent, contact, callLog);

                        callLog.status = 'answered';
                        await callLog.save();

                        callAudioBuffers.set(waCallId, {
                            samples: [],
                            lastActivity: Date.now(),
                            isSpeaking: false,
                            speechSegments: 0,
                            totalFramesProcessed: 0
                        });

                        console.log(`[CallAutomation] Audio buffer initialized for call ${waCallId}`);

                        if (agent.welcome_message) {
                            console.log(`[Welcome] Playing welcome message: ${agent.welcome_message}`);
                            await this.processTTS(agent, agent.welcome_message, callLog, waCallId);

                            callLog.nodes_executed.push({
                                node_id: 'welcome_auto',
                                executed_at: new Date(),
                                response: { text: agent.welcome_message }
                            });
                        await callLog.save();
                        }
                    } else if (session?.sdp_type === 'answer') {
                        const callbackData = JSON.parse(callData.biz_opaque_callback_data || '{}');
                        if (callbackData.is_outbound) {
                            await this.handleOutboundCallConnected(waCallId, session, callbackData, phoneNumberId);
                        }
                    }
                    break;

                case 'connected':
                    if (callLog) {
                        const agent = await WhatsappCallAgent.findById(callLog.agent_id);
                        if (agent) {
                            await this.executeNode(callLog, agent, agent.nodes[0]?.id, waCallId);
                        }
                    }
                    break;

                case 'terminate':
                    if (callLog) {
                        const audioBuffer = callAudioBuffers.get(waCallId);
                        if (audioBuffer) {
                            console.log(`[CallAutomation] Call ${waCallId} ended.`);
                        }

                        callAudioBuffers.delete(waCallId);

                        try {
                            const webrtcService = (await import('./webrtc.service.js')).default;
                            webrtcService.cleanup(waCallId);
                        } catch (err) {
                            console.error('[CallAutomation] Error cleaning up WebRTC on terminate:', err.message);
                        }

                        await this.terminateCall(callLog);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling call webhook:', error);
        }
    }

    async resolveContactAndAgent(contactNumber, phoneNumberId) {
        const contact = await Contact.findOne({ phone_number: contactNumber });
        let agent = null;

        if (contact && contact.assigned_call_agent_id) {
            agent = await WhatsappCallAgent.findById(contact.assigned_call_agent_id);
        }

        if (!agent) {
            const settings = await WhatsappCallSetting.findOne({ phone_number_id: phoneNumberId });
            if (settings && settings.fallback_agent_id) {
                agent = await WhatsappCallAgent.findById(settings.fallback_agent_id);
            }
        }

        return { contact, agent };
    }

    async handleIncomingCall(waCallId, phoneNumberId, contactNumber) {
        const { contact, agent } = await this.resolveContactAndAgent(contactNumber, phoneNumberId);
        console.log("contact", contact, agent);

        if (agent) {
            const callLog = await WhatsappCallLog.create({
                user_id: agent.user_id,
                contact_id: contact?._id,
                phone_number_id: phoneNumberId,
                agent_id: agent._id,
                wa_call_id: waCallId,
                status: 'answered'
            });
            await this.executeNode(callLog, agent, agent.nodes[0]?.id, waCallId);
        }
    }

    async handleUserInitiatedCall(callPayload, phoneNumberId) {
        const { id: waCallId, from, sip_audio } = callPayload;
        const contactNumber = from.id;

        try {
            const { contact, agent } = await this.resolveContactAndAgent(contactNumber, phoneNumberId);

            if (!agent) {
                console.error(`[CallAutomation] No agent found for user initiated call ${waCallId}`);
                await whatsappCallingService.terminateCall(phoneNumberId, waCallId);
                return;
            }

            let callLog = await WhatsappCallLog.findOne({ wa_call_id: waCallId });
            if (!callLog) {
                callLog = await WhatsappCallLog.create({
                    user_id: agent.user_id,
                    contact_id: contact?._id,
                    phone_number_id: phoneNumberId,
                    agent_id: agent._id,
                    wa_call_id: waCallId,
                    status: 'ringing'
                });
            }

            console.log(`[CallAutomation] Answering USER-INITIATED call ${waCallId} from ${contactNumber}`);

            const sdpOffer = sip_audio?.sdp;

            if (sdpOffer) {
                await whatsappCallingService.answerCall(phoneNumberId, waCallId, sdpOffer, agent, contact, callLog);

                callLog.status = 'answered';
                await callLog.save();

                await this.executeNode(callLog, agent, agent.nodes[0]?.id, waCallId);
            } else {
                console.error("[CallAutomation] No SDP Offer found in user initiated call!");
            }
        } catch (error) {
            console.error('[CallAutomation] Error handling user initiated call webhook:', error);
        }
    }

    async handleUserSpeech(waCallId, userText) {
        if (!userText || userText.trim().length === 0) return;

        if (aiProcessingLocks.get(waCallId)) {
            console.log(`[CallAutomation] AI already processing for ${waCallId}, dropping new input: "${userText}"`);
            return;
        }
        aiProcessingLocks.set(waCallId, true);

        try {
            const callLog = await WhatsappCallLog.findOne({ wa_call_id: waCallId });
            if (!callLog || callLog.status === 'completed') return;

            const agent = await WhatsappCallAgent.findById(callLog.agent_id);
            if (!agent) return;

            console.log(`[CallAutomation] User said: ${userText}`);

            if (agent.recording_config.enable_transcription) {
                this.appendTranscript(callLog, 'user', userText);
                await callLog.save();
            }

            if (agent.hangup_config && agent.hangup_config.enabled) {
                const hangupKeyword = this.detectHangupTrigger(agent.hangup_config, userText);
                if (hangupKeyword) {
                    console.log(`[CallAutomation] Hangup trigger "${hangupKeyword}" detected in: "${userText}"`);
                    const farewell = agent.hangup_config.farewell_message || 'Thank you for calling. Goodbye!';

                    await this.processTTS(agent, farewell, callLog, waCallId);

                    const whatsappCallingService = (await import('./whatsapp-calling.service.js')).default;
                    await whatsappCallingService.terminateCall(callLog.phone_number_id, waCallId);

                    callLog.status = 'completed';
                    callLog.end_time = new Date();
                    callLog.duration = Math.round((callLog.end_time - callLog.start_time) / 1000);
                    await callLog.save();

                    return;
                }
            }


            const triggeredFunction = this.detectFunctionTrigger(agent.available_functions, userText);
            console.log("triggeredFunction", triggeredFunction);
            if (triggeredFunction) {
                console.log(`[CallAutomation] Function trigger detected: ${triggeredFunction.name}`);
                console.log(`[CallAutomation] Function ID: ${triggeredFunction.id}`);
                console.log(`[CallAutomation] Matched keyword: ${triggeredFunction.matched_keyword}`);
                console.log(`[CallAutomation] API Config:`, triggeredFunction.api_config);

                callLog.triggered_functions = callLog.triggered_functions || [];
                const existingTrigger = callLog.triggered_functions.find(
                    tf => tf.function_id === triggeredFunction.id && !tf.executed_at
                );
                if (!existingTrigger) {
                    callLog.triggered_functions.push({
                        function_id: triggeredFunction.id,
                        function_name: triggeredFunction.name,
                        matched_keyword: triggeredFunction.matched_keyword,
                        triggered_at: new Date(),
                        user_speech: userText
                    });
                    await callLog.save();
                }

                await this.handleTriggeredFunction(triggeredFunction, callLog, agent, waCallId);
                return;
            }

            const pendingFunction = callLog.pending_function_call;
            if (pendingFunction) {
                console.log(`[CallAutomation] Collecting parameters for function: ${pendingFunction.function_name}`);

                const functionDef = agent.available_functions?.find(
                    f => f.id === pendingFunction.function_id || f.name === pendingFunction.function_name
                );

                if (functionDef && functionDef.parameters) {
                    const extractedParams = this.extractParametersFromSpeech(functionDef.parameters, userText, callLog.collected_params || {});
                    callLog.collected_params = extractedParams;

                    const missingParams = functionDef.parameters.filter(p => p.required && !extractedParams[p.name]);

                    if (missingParams.length === 0) {
                        console.log(`[CallAutomation] All parameters collected, executing function`);

                        const funcResult = await this.executeFunctionWithCollectedParams(functionDef, extractedParams, callLog);


                        if (funcResult.message) {
                            await this.processTTS(agent, funcResult.message, callLog, waCallId);
                        }

                        callLog.pending_function_call = null;
                        callLog.collected_params = null;
                        await callLog.save();


                        const currentNode = agent.nodes.find(n => n.id === pendingFunction.node_id);
                        if (currentNode?.next_node_id) {
                            await this.executeNode(callLog, agent, currentNode.next_node_id, waCallId);
                        }
                        return;
                    } else {

                        const nextParam = missingParams[0];
                        const question = `Please provide your ${nextParam.name}${nextParam.description ? ' (' + nextParam.description + ')' : ''}.`;
                        await this.processTTS(agent, question, callLog, waCallId);
                        callLog.pending_function_call = pendingFunction;
                        await callLog.save();
                        return;
                    }
                }
            }

            const aiResponse = await this.processAIRequest(agent, {
                user_input: userText
            }, callLog);

            if (aiResponse) {
                console.log(`[CallAutomation] AI Response: ${aiResponse}`);

                const aiNode = agent.nodes.find(n => n.type === 'ai_info');
                if (aiNode) {
                    callLog.nodes_executed.push({
                        node_id: aiNode.id,
                        executed_at: new Date(),
                        response: { text: aiResponse }
                    });
                    await callLog.save();
                }

                await this.processTTS(agent, aiResponse, callLog, waCallId);
            }
        } catch (error) {
            console.error('[CallAutomation] handleUserSpeech error:', error);
        } finally {
            aiProcessingLocks.set(waCallId, false);
        }
    }

    extractParametersFromSpeech(paramDefinitions, userSpeech, existingParams = {}) {
        const extracted = { ...existingParams };

        paramDefinitions.forEach(param => {
            if (extracted[param.name]) return;

            const speechLower = userSpeech.toLowerCase();

            let value = null;

            const patterns = [
                new RegExp(`\\b(?:${param.name.replace(/_/g, '[\\s_]?')}|${param.name.replace(/_/g, ' ')})\\s+(?:is|was|will be|equals)?\\s+([\\w\\s]+?)(?:\\.|$|for|my|the)`, 'i'),
                new RegExp(`\\bit\\s+(?:is|was)\\s+([\\w\\s]+?)(?:\\.|$|for|my|the)`, 'i'),
                new RegExp(`${param.example}\\b`, 'i')
            ];

            for (const pattern of patterns) {
                const match = speechLower.match(pattern);
                if (match && match[1]) {
                    value = match[1].trim();
                    break;
                }
            }

            if (!value) {
                const afterIs = speechLower.match(/\bis\s+([\w\s]+?)(?:\.|$)/i);
                if (afterIs && afterIs[1]) {
                    value = afterIs[1].trim();
                }
            }

            if (value) {
                value = value.replace(/[^"]\w\\s@.+-]/gi, '').trim();

                if (param.type === 'number' || param.type === 'string') {
                    const numberWords = {
                        'zero': '0', 'one': '1', 'two': '2', 'three': '3',
                        'four': '4', 'five': '5', 'six': '6', 'seven': '7',
                        'eight': '8', 'nine': '9', 'ten': '10',
                        'eleven': '11', 'twelve': '12', 'thirteen': '13',
                        'fourteen': '14', 'fifteen': '15', 'sixteen': '16',
                        'seventeen': '17', 'eighteen': '18', 'nineteen': '19',
                        'twenty': '20', 'thirty': '30', 'forty': '40',
                        'fifty': '50', 'sixty': '60', 'seventy': '70',
                        'eighty': '80', 'ninety': '90',
                        'hundred': '100', 'thousand': '1000'
                    };

                    const hasNumberWords = Object.keys(numberWords).some(word =>
                        value.split(/\s+/).includes(word)
                    );

                    if (hasNumberWords) {
                        let numericValue = '';
                        const words = value.split(/\s+/);
                        let currentNum = 0;
                        let total = 0;

                        for (const word of words) {
                            if (numberWords[word]) {
                                const num = parseInt(numberWords[word]);
                                if (num >= 100) {
                                    currentNum *= num;
                                } else {
                                    currentNum += num;
                                }

                                if (num >= 1000) {
                                    total += currentNum;
                                    currentNum = 0;
                                }
                            } else if (/^\d+$/.test(word)) {
                                total += parseInt(word);
                            }
                        }
                        total += currentNum;

                        if (total > 0) {
                            value = total.toString();
                        }
                    } else {
                        const digits = value.match(/\d+/);
                        if (digits) {
                            value = digits[0];
                        }
                    }
                }

                if (value) {
                    if (param.type === 'number') {
                        const num = parseFloat(value);
                        if (!isNaN(num)) extracted[param.name] = num;
                    } else if (param.type === 'boolean') {
                        extracted[param.name] = /yes|true|ok|sure/i.test(value);
                    } else {
                        extracted[param.name] = value;
                    }
                }
            }
        });

        return extracted;
    }

async executeFunctionWithCollectedParams(functionDef, params, callLog) {
    console.log(`[Function] Executing ${functionDef.name} with params:`, params);

    const apiConfig = functionDef.api_config || {};
    console.log("apiConfig", apiConfig);

    const method = apiConfig.method || 'GET';
    const url = this.buildApiUrlFromTemplate(functionDef, params);
    const body = this.buildRequestBody(apiConfig.body_template, params);

    let headers = {
        'Content-Type': 'application/json'
    };

    if (Array.isArray(apiConfig.headers)) {
        apiConfig.headers.forEach(header => {
            if (header.key && header.value) {
                headers[header.key] = header.value;
            }
        });
    }

    console.log("[Function] API Call:", { method, url, headers, hasBody: !!body });

    try {
        const response = await axios({
            method: method,
            url: url,
            data: body,
            headers: headers
        });


        return {
            success: response.status >= 200 && response.status < 300,
            data: response.data,
            message: this.generateResponseMessage(response.data, { parameters: {} })
        };

    } catch (error) {
        console.error(`[Function] Execution failed:`, error.message);

        return {
            success: false,
            error: error.message,
            message: 'Sorry, there was an error processing your request.'
        };
    }
}


    detectFunctionTrigger(availableFunctions, userSpeech) {
        if (!availableFunctions || !Array.isArray(availableFunctions)) return null;

        const speechLower = userSpeech.toLowerCase();

        for (const func of availableFunctions) {
            if (!func.is_active) continue;

            const triggerKeywords = func.trigger_keywords || [];

            for (const keyword of triggerKeywords) {
                if (speechLower.includes(keyword.toLowerCase())) {
                    console.log(`[Trigger] Matched keyword "${keyword}" for function "${func.name}"`);

                    const plainFunc = func.toObject ? func.toObject() : func;
                    return { ...plainFunc, matched_keyword: keyword };
                }
            }
        }

        return null;
    }

    detectHangupTrigger(hangupConfig, text) {
        if (!hangupConfig || !hangupConfig.enabled || !hangupConfig.trigger_keywords || !text) return null;
        const normalizedText = text.toLowerCase().trim();
        for (const keyword of hangupConfig.trigger_keywords) {
            if (keyword && normalizedText.includes(keyword.toLowerCase())) {
                return keyword;
            }
        }
        return null;
    }

    async handleTriggeredFunction(functionDef, callLog, agent, waCallId) {
        console.log(`[Trigger] Handling triggered function: ${functionDef.name}`);

        if (!functionDef || !functionDef.id || !functionDef.api_config) {
            console.error(`[Trigger] ERROR: Invalid function definition!`, {
                hasFunctionDef: !!functionDef,
                hasId: !!functionDef?.id,
                hasApiConfig: !!functionDef?.api_config
            });
            return;
        }

        console.log(`[Trigger] Function ID: ${functionDef.id}`);
        console.log(`[Trigger] API Config:`, functionDef.api_config);

        if (functionDef.parameters && functionDef.parameters.length > 0) {
            const collectedParams = callLog.collected_params || {};
            const missingParams = functionDef.parameters.filter(p => p.required && !collectedParams[p.name]);

            if (missingParams.length > 0) {
                console.log(`[Trigger] Function requires parameters, starting collection`);

                callLog.pending_function_call = {
                    function_id: functionDef.id,
                    function_name: functionDef.name,
                    matched_keyword: functionDef.matched_keyword,
                    triggered_by: 'speech_keyword',
                    started_at: new Date()
                };
                callLog.collected_params = collectedParams;
                await callLog.save();

                const nextParam = missingParams[0];
                const question = `I can help you with ${functionDef.name}. Please provide your ${nextParam.name}${nextParam.description ? ' (' + nextParam.description + ')' : ''}.`;
                await this.processTTS(agent, question, callLog, waCallId);
                return;
            }
        }


        console.log(`[Trigger] Executing function immediately`);
        const funcResult = await this.executeFunctionWithCollectedParams(functionDef, callLog.collected_params || {}, callLog);

        if (funcResult.success && funcResult.data) {
            callLog.last_api_context = {
                function_name: functionDef.name,
                fetched_at: new Date(),
                data: funcResult.data
            };
            await callLog.save();
        }

        console.log(`[AI] Generating response from API data...`);
        let aiResponse;
        try {
            aiResponse = await this.processAIRequest(agent, {
                user_input: callLog.transcription?.split('\n').pop()?.replace('User: ', '') || '',
                api_response: funcResult.data || funcResult
            }, callLog);
        } catch (aiError) {
            console.warn(`[AI] All Gemini retries exhausted. Using fallback response.`);
            aiResponse = this.buildFallbackResponse(funcResult.data, functionDef.name);
        }

        callLog.triggered_functions = callLog.triggered_functions || [];
        const triggerRecord = callLog.triggered_functions.find(
            tf => tf.function_id === functionDef.id && !tf.executed_at
        );
        if (triggerRecord) {
            triggerRecord.executed_at = new Date();
            triggerRecord.result = funcResult;
            await callLog.save();
        } else {
            callLog.triggered_functions.push({
                function_id: functionDef.id,
                function_name: functionDef.name,
                matched_keyword: functionDef.matched_keyword,
                triggered_at: new Date(),
                executed_at: new Date(),
                result: funcResult,
                user_speech: callLog.transcription?.split('\n').pop()?.replace('User: ', '') || ''
            });
            await callLog.save();
        }

        if (aiResponse) {
            console.log(`[AI] Response: ${aiResponse}`);
            await this.processTTS(agent, aiResponse, callLog, waCallId);
        }
    }

    async executeNode(callLog, agent, nodeId, waCallId) {
        if (!nodeId) return;

        const node = agent.nodes.find(n => n.id === nodeId);
        if (!node) return;

        try {
            console.log(`Executing node: ${node.type} (${node.id})`);

            const params = this.replacePlaceholders(node.parameters, callLog);
            let nextNodeId = node.next_node_id;

            switch (node.type) {
                case 'welcome':
                    const welcomePlayed = callLog.nodes_executed.find(n => n.node_id === 'welcome_auto');
                    if (!welcomePlayed) {
                        await this.processTTS(agent, agent.welcome_message, callLog, waCallId);
                    } else {
                        console.log('[Welcome] Welcome message already played, skipping...');
                    }
                    break;

                case 'ai_info':
                    const aiResponse = await this.processAIRequest(agent, params, callLog);
                    callLog.nodes_executed.push({
                        node_id: node.id,
                        executed_at: new Date(),
                        response: { text: aiResponse }
                    });
                    await this.processTTS(agent, aiResponse, callLog, waCallId);
                    break;

                case 'function':
                    const wasTriggeredBySpeech = callLog.triggered_functions?.some(
                        tf => tf.function_id === node.parameters?.function_id &&
                              tf.executed_at &&
                              (Date.now() - new Date(tf.executed_at).getTime()) < 5000
                    );

                    if (wasTriggeredBySpeech) {
                        console.log(`[Function] Skipping node execution - function already executed by speech trigger`);
                        break;
                    }

                    const functionDef = agent.available_functions?.find(f => f.id === node.parameters?.function_id);
                    console.log("functionDef" , functionDef);
                    if (functionDef && functionDef.parameters && functionDef.parameters.length > 0) {
                        const collectedParams = callLog.collected_params || {};
                        const missingParams = functionDef.parameters.filter(p => p.required && !collectedParams[p.name]);

                        if (missingParams.length > 0) {
                            console.log(`[Function] Starting parameter collection for: ${functionDef.name}`);

                            callLog.pending_function_call = {
                                function_id: functionDef.id,
                                function_name: functionDef.name,
                                node_id: node.id,
                                started_at: new Date()
                            };
                            callLog.collected_params = collectedParams;
                            await callLog.save();


                            const nextParam = missingParams[0];
                            const question = `I can help you with ${functionDef.name}. Please provide your ${nextParam.name}${nextParam.description ? ' (' + nextParam.description + ')' : ''}.`;
                            await this.processTTS(agent, question, callLog, waCallId);
                            break;
                        }
                    }

                    const funcResult = await this.executeFunctionNode(node, callLog);
                    callLog.nodes_executed.push({
                        node_id: node.id,
                        executed_at: new Date(),
                        response: funcResult
                    });
                    await callLog.save();

                    if (funcResult?.message) {
                        await this.processTTS(agent, funcResult.message, callLog, waCallId);
                    }
                    break;

                case 'hang_up':
                    const endMsg = params.message || 'Goodbye';
                    await this.processTTS(agent, endMsg, callLog, waCallId);
                    await whatsappCallingService.terminateCall(callLog.phone_number_id, callLog.wa_call_id);
                    await this.terminateCall(callLog);
                    return;
            }

            if (nextNodeId && node.type !== 'ai_info' && node.type !== 'welcome') {
                await this.executeNode(callLog, agent, nextNodeId, waCallId);
            }
        } catch (error) {
            console.error(`Error executing node ${nodeId}:`, error);
        }
    }

    replacePlaceholders(params, callLog) {
        if (!params || typeof params !== 'object') return params;
        const json = JSON.stringify(params);
        const replaced = json.replace(/\{\{(.*?)\}\}/g, (match, path) => {
            const [nodeId, ...propPath] = path.trim().split('.');
            const nodeExec = callLog.nodes_executed.find(n => n.node_id === nodeId);
            if (nodeExec) {
                return propPath.reduce((obj, key) => obj?.[key], nodeExec.response) || match;
            }
            return match;
        });
        return JSON.parse(replaced);
    }


    async processSTT(agent, opusFrames, waCallId) {
        const { api_key } = agent.voice_config;
        if (!api_key) {
            console.warn('[STT] No API key configured in voice_config');
            return '';
        }

        if (!Array.isArray(opusFrames) || opusFrames.length === 0) {
            console.warn('[STT] No audio frames to process.');
            return '';
        }

        try {

            const pcmBuffer = Buffer.concat(opusFrames.map(frame => {
                const buf = Buffer.alloc(frame.length * 2);
                for (let i = 0; i < frame.length; i++) {
                    buf.writeInt16LE(frame[i], i * 2);
                }
                return buf;
            }));

            const minBytes = 8000 * 2 * 0.2;
            if (!pcmBuffer || pcmBuffer.length < minBytes) {
                console.warn(`[STT] PCM too short (${pcmBuffer?.length || 0} bytes, minimum ${minBytes}), skipping STT.`);
                return '';
            }

            const wavBuffer = this.generateWavBuffer(pcmBuffer, 8000, 1, 16);

            const recordingsDir = path.join(process.cwd(), 'uploads', 'recordings');
            if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `stt_${waCallId}_${timestamp}.wav`;
            const audioFilePath = path.join(recordingsDir, filename);
            fs.writeFileSync(audioFilePath, wavBuffer);

            const duration = (pcmBuffer.length / (8000 * 2)).toFixed(2);
            console.log(`[STT] Calling ElevenLabs REST API. WAV: ${audioFilePath} (${duration}s, ${pcmBuffer.length} bytes)`);

            const formData = new FormData();
            formData.append('model_id', 'scribe_v2');
            formData.append('file', fs.createReadStream(audioFilePath), {
                filename: `speech_${waCallId}.wav`,
                contentType: 'audio/wav'
            });

            const response = await axios.post(
                'https://api.elevenlabs.io/v1/speech-to-text?enable_logging=true',
                formData,
                {
                    headers: {
                        'xi-api-key': api_key,
                        ...formData.getHeaders()
                    },
                    timeout: 30000
                }
            );

            const transcript = response.data?.text || '';
            console.log(`[STT] Transcript received: "${transcript}"`);

            if (!agent.recording_config?.enable_user_recording && fs.existsSync(audioFilePath)) {
                fs.unlinkSync(audioFilePath);
                console.log(`[STT] Deleted temporary audio file: ${audioFilePath}`);
            }

            return transcript.trim();

        } catch (error) {
            console.error('[STT] Eleven Labs API error:', error.response?.data || error.message);

            if (error.response) {
                console.error('[STT] Response status:', error.response.status);
                console.error('[STT] Response data:', JSON.stringify(error.response.data));
            } else if (error.request) {
                console.error('[STT] No response received:', error.request);
            }

            return '';
        }
    }

    generateWavBuffer(pcmBuffer, sampleRate = 16000, channels = 1, bitsPerSample = 16) {
        const dataSize = pcmBuffer.length;
        const buffer = Buffer.alloc(44 + dataSize);

        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + dataSize, 4);
        buffer.write('WAVE', 8);

        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20);
        buffer.writeUInt16LE(channels, 22);
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
        buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
        buffer.writeUInt16LE(bitsPerSample, 34);

        buffer.write('data', 36);
        buffer.writeUInt32LE(dataSize, 40);

        pcmBuffer.copy(buffer, 44);
        return buffer;
    }


    resample(input, srcRate, dstRate, channels = 1) {
        const bytesPerSample = 2;
        const inputSamples = Math.floor(input.length / (bytesPerSample * channels));
        const outputSamples = Math.floor(inputSamples * dstRate / srcRate);
        const output = Buffer.alloc(outputSamples * bytesPerSample * channels);

        for (let i = 0; i < outputSamples; i++) {
            for (let c = 0; c < channels; c++) {
                const srcFrac = (i / outputSamples) * inputSamples;
                const srcIdxA = Math.min(Math.floor(srcFrac), inputSamples - 1);
                const srcIdxB = Math.min(srcIdxA + 1, inputSamples - 1);
                const t = srcFrac - srcIdxA;

                const sampleA = input.readInt16LE((srcIdxA * channels + c) * bytesPerSample);
                const sampleB = input.readInt16LE((srcIdxB * channels + c) * bytesPerSample);
                const out = Math.round(sampleA + t * (sampleB - sampleA));
                const clamped = Math.max(-32768, Math.min(32767, out));
                output.writeInt16LE(clamped, (i * channels + c) * bytesPerSample);
            }
        }
        return output;
    }

    resampleAndDownmix(pcmBuffer, sourceRate, targetRate) {
        const ratio = targetRate / sourceRate;
        const channels = 2;
        const bytesPerSample = 2;

        const inputSamples = pcmBuffer.length / (channels * bytesPerSample);
        const outputSamples = Math.floor(inputSamples * ratio);

        const outputBuffer = Buffer.alloc(outputSamples * bytesPerSample);

        for (let i = 0; i < outputSamples; i++) {
            const srcIndex = Math.floor(i / ratio);
            const leftSample = pcmBuffer.readInt16LE(srcIndex * 4);
            const rightSample = pcmBuffer.readInt16LE(srcIndex * 4 + 2);

            const monoSample = Math.floor((leftSample + rightSample) / 2);
            outputBuffer.writeInt16LE(monoSample, i * 2);
        }

        return outputBuffer;
    }


    appendTranscript(callLog, role, text) {
        const roleCapitalized = role === 'agent' ? 'Agent' : 'User';
        callLog.transcription = (callLog.transcription || '') + `\n${roleCapitalized}: ${text}`;

        callLog.transcription_json = callLog.transcription_json || [];
        callLog.transcription_json.push({
            role: role.toLowerCase(),
            text: text,
            timestamp: new Date()
        });
    }

    async processTTS(agent, text, callLog, waCallId) {
        const { tts_provider, voice_id, api_key } = agent.voice_config;

        try {
            console.log(`[TTS] Requesting ElevenLabs TTS for: "${text}"`);

            const targetVoice = (voice_id || 'JBFqnCBsd6RMkjVDRZzb').trim();

            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}?output_format=pcm_16000`,
                {
                    text,
                    model_id: 'eleven_turbo_v2'
                },
                {
                    headers: {
                        'xi-api-key': api_key,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer'
                }
            );

            const pcmBuffer = Buffer.from(response.data);
            console.log(`[TTS] Received PCM buffer: ${pcmBuffer.length} bytes (${(pcmBuffer.length / (16000 * 2)).toFixed(2)}s at 16kHz)`);

            const recordingsDir = path.join(process.cwd(), 'uploads', 'recordings');
            if (!fs.existsSync(recordingsDir)) {
                fs.mkdirSync(recordingsDir, { recursive: true });
            }

            try {
                const filename = `agent_raw_${waCallId || 'unknown'}_${Date.now()}.wav`;
                const rawWavPath = path.join(recordingsDir, filename);
                const rawWav = this.generateWavBuffer(pcmBuffer, 16000, 1, 16);
                fs.writeFileSync(rawWavPath, rawWav);

                if (agent.recording_config?.enable_agent_recording) {
                    callLog.recordings = callLog.recordings || { user: [], agent: [] };
                    if (!Array.isArray(callLog.recordings.agent)) callLog.recordings.agent = [];
                    callLog.recordings.agent.push(`/uploads/recordings/${filename}`);
                    await callLog.save();
                }
            } catch (e) {
                console.error('[TTS] Failed to write raw debug WAV:', e.message);
            }

            if (waCallId) {
                try {
                    await webrtcService.playAudio(waCallId, pcmBuffer);
                } catch (e) {
                    console.error('[TTS] Error while sending audio to WebRTC:', e.message);
                }
            }

            if (agent.recording_config?.enable_transcription) {
                const freshCallLog = await WhatsappCallLog.findById(callLog._id);
                if (freshCallLog) {
                    this.appendTranscript(freshCallLog, 'agent', text);
                    await freshCallLog.save();
                } else {
                    this.appendTranscript(callLog, 'agent', text);
                    await callLog.save();
                }
            }
        } catch (error) {
            console.error(`[TTS] Error processing TTS or saving log:`, error.stack || error.message);
            if (error.response?.data) {
                let errorMessage;
                if (error.response.data instanceof ArrayBuffer || Buffer.isBuffer(error.response.data)) {
                    try { errorMessage = Buffer.from(error.response.data).toString('utf-8'); } catch (e) {}
                } else {
                    errorMessage = JSON.stringify(error.response.data);
                }
                if (errorMessage) console.error(`[TTS] API Response Error:`, errorMessage);
            }
        }
    }

    async processAIRequest(agent, params, callLog) {
        const { prompt, training_url, include_concise_instruction } = agent.ai_config;

        let fullPrompt = `${prompt}`;

        if (include_concise_instruction !== false) {
            fullPrompt += `\n\nIMPORTANT INSTRUCTIONS:\n- Keep your responses VERY short (1-2 sentences max)\n- Do not include any special characters, emojis, or formatting symbols\n- Speak naturally and clearly\n- Be conversational but brief\n- Do NOT repeat information you have already provided in this conversation\n- Do NOT ask for information the customer has already given`;
        }

        const allTranscriptions = (callLog.transcription || '').split('\n').filter(t => t.trim());
        const recentTranscriptions = allTranscriptions.slice(-10);

        if (recentTranscriptions.length > 0) {
            fullPrompt += `\n\nCONVERSATION HISTORY (do NOT repeat what Agent already said):`;
            recentTranscriptions.forEach(line => {
                if (line.trim()) {
                    fullPrompt += `\n${line}`;
                }
            });
        }

        fullPrompt += `\n\nCurrent User Message: ${params.user_input || ''}`;

        const apiData = params.api_response || callLog.last_api_context?.data;
        if (apiData) {
            const apiSummary = typeof apiData === 'object'
                ? JSON.stringify(apiData).substring(0, 500)
                : String(apiData).substring(0, 500);

            const contextLabel = callLog.last_api_context?.function_name
                ? `Data from ${callLog.last_api_context.function_name}`
                : 'Product Information Available';

            fullPrompt += `\n\n${contextLabel}: ${apiSummary}`;
            fullPrompt += `\n\nUse this data to answer the user's question accurately. Be specific about prices and details. Provide a complete answer in one response.`;
        }

        fullPrompt += `\n\nTraining Context: ${training_url}`;

        console.log(`[AI Prompt] Full prompt length: ${fullPrompt.length} chars`);

        const MAX_RETRIES = 3;
        let lastError;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await axios.post(
                    `https://generativelanguage.googleapis.com/v1/models/${agent.ai_config.model_id}:generateContent?key=${agent.ai_config.api_key}`,
                    {
                        contents: [
                            {
                                parts: [
                                    { text: fullPrompt }
                                ]
                            }
                        ]
                    },
                    {
                        headers: { 'Content-Type': 'application/json' }
                    }
                );

                const aiText = response.data.candidates[0].content.parts[0].text;
                const cleanedText = aiText.replace(/\n+/g, ' ').substring(0, 300);
                console.log(`[AI] Cleaned response: ${cleanedText}`);
                return cleanedText;

            } catch (error) {
                lastError = error;
                const status = error.response?.status;

                if (status === 429 && attempt < MAX_RETRIES) {
                    const delayMs = 2000 * attempt;
                    console.warn(`[AI] Gemini 429 rate limit hit (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                } else {

                    console.error(`[AI] Gemini request failed after ${attempt} attempt(s):`, error.response?.data || error.message);
                    throw error;
                }
            }
        }

        throw lastError;
    }


    buildFallbackResponse(data, functionName) {
        try {
            if (!data) return 'I retrieved the data but could not process it right now. Please try again shortly.';

            const listData = data.data || data.products || data.items || data.result || data;

            if (Array.isArray(listData) && listData.length > 0) {
                const items = listData.slice(0, 5);
                const parts = items.map(item => {
                    const name = item.name || item.title || item.product_name || item.label || 'item';
                    const price = item.price || item.sale_price || item.cost;
                    const salePrice = item.sale_price || item.discounted_price || item.offer_price;
                    if (price && salePrice && price !== salePrice) return `${name} at ${price}, on sale for ${salePrice}`;
                    if (price) return `${name} at ${price}`;
                    return name;
                });
                const intro = listData.length === 1 ? 'Here is the product:' : `Here are ${Math.min(listData.length, 5)} products:`;
                return `${intro} ${parts.join('; ')}.`;
            }

            if (typeof listData === 'object') {
                const name = listData.name || listData.title || functionName || 'the result';
                const price = listData.price || listData.sale_price;
                if (price) return `${name} is priced at ${price}.`;
                return `I found information about ${name}. Please ask a specific question about it.`;
            }

            return String(listData).substring(0, 200);
        } catch (e) {
            console.error('[AI] buildFallbackResponse error:', e.message);
            return 'I retrieved the information but could not process it right now. Please try again.';
        }
    }

    async executeFunctionNode(node, callLog) {
        const params = this.replacePlaceholders(node.parameters, callLog);
        const { api_url, method, body, function_name, collected_params } = params;

        if (collected_params && typeof collected_params === 'object') {
            console.log(`[Function] Executing function ${function_name || 'API call'} with collected parameters:`, collected_params);

            const apiUrl = api_url || this.buildApiUrlFromTemplate({ api_config: { url: api_url } }, collected_params);
            const requestBody = this.buildRequestBody(body, collected_params);

            try {
                const response = await axios({
                    method: method || 'POST',
                    url: apiUrl,
                    data: requestBody,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                console.log(`[Function] API response:`, response.data);

                return {
                    success: response.status >= 200 && response.status < 300,
                    status: response.status,
                    data: response.data,
                    message: this.generateResponseMessage(response.data, node)
                };
            } catch (error) {
                console.error(`[Function] API call failed:`, error.message);
                return {
                    success: false,
                    status: error.response?.status || 0,
                    error: error.message,
                    message: 'Sorry, there was an error processing your request.'
                };
            }
        }

        if (api_url) {
            const response = await axios({
                method: method || 'GET',
                url: api_url,
                data: body
            });
            return response.data;
        }
        return null;
    }

    buildApiUrlFromTemplate(functionDef, params) {
        const template = functionDef.api_config?.url || '';
        let url = template;

        Object.keys(params).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            url = url.replace(regex, encodeURIComponent(params[key]));
        });

        console.log(`[buildApiUrl] Template: ${template}, Final URL: ${url}`);
        return url;
    }

    buildRequestBody(template, params) {
        if (!template) {
            return params;
        }

        let body = template;
        Object.keys(params).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            body = body.replace(regex, params[key]);
        });

        try {
            return JSON.parse(body);
        } catch (e) {
            console.error('[Function] Failed to parse request body:', e.message);
            return params;
        }
    }

    generateResponseMessage(data, node) {

        const responseType = node.parameters?.response_mapping?.message_field || 'message';
        const message = data[responseType] || data.message || data.msg || 'Request completed successfully';


        return message.replace(/[^\w\s.,!?]/gi, '').substring(0, 200);
    }

    async terminateCall(callLog) {
        callLog.status = 'completed';
        callLog.end_time = new Date();
        callLog.duration = Math.floor((callLog.end_time - callLog.start_time) / 1000);
        await callLog.save();
        console.log(`Call ${callLog.wa_call_id} terminated.`);
    }


    async initiateOutboundCall(phoneNumberId, contactNumber, agentId, userId, campaignId = null) {
        try {
            console.log(`[OutboundCall] Initiating call to ${contactNumber}`);

            const agent = await WhatsappCallAgent.findById(agentId);
            if (!agent || agent.deleted_at) {
                throw new Error('Call agent not found');
            }

            const contact = await Contact.findOne({ phone_number: contactNumber });

            const phone = await WhatsappPhoneNumber.findOne({
                phone_number_id: phoneNumberId,
                deleted_at: null
            }).populate('waba_id');

            if (!phone || !phone.waba_id?.access_token) {
                throw new Error('Phone number or access token not found');
            }

            const accessToken = phone.waba_id.access_token;

            const wrtc = wrtcPkg;
            const pc = new wrtc.RTCPeerConnection({
                sdpSemantics: 'unified-plan'
            });

            const { RTCAudioSource } = wrtc.nonstandard;
            const audioSource = new RTCAudioSource();
            const outgoingTrack = audioSource.createTrack();
            pc.addTrack(outgoingTrack);

            const offer = await pc.createOffer({
                offerToReceiveAudio: true
            });

            await pc.setLocalDescription(offer);

            await new Promise((resolve) => {
                if (pc.iceGatheringState === 'complete') {
                    resolve();
                } else {
                    pc.addEventListener('icegatheringstatechange', () => {
                        if (pc.iceGatheringState === 'complete') {
                            resolve();
                        }
                    });
                }
            });

            const localSdp = pc.localDescription.sdp;

            const response = await axios.post(
                `https://graph.facebook.com/v21.0/${phoneNumberId}/calls`,
                {
                    messaging_product: 'whatsapp',
                    to: contactNumber,
                    action: 'connect',
                    session: {
                        sdp_type: 'offer',
                        sdp: localSdp
                    },
                    biz_opaque_callback_data: JSON.stringify({
                        is_outbound: true,
                        contact_id: contact?._id,
                        agent_id: agentId,
                        user_id: userId,
                        campaign_id: campaignId
                    })
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = response.data;

            if (data.error) {
                throw new Error(data.error.message);
            }

            const callId = data.calls?.[0]?.id;
            if (!callId) {
                throw new Error('No call ID in response');
            }

            console.log(`✅ Outbound call initiated to ${contactNumber}, call ID: ${callId}`);

            webrtcService.storeOutboundConnection(callId, pc, audioSource, phoneNumberId);

            return { success: true, callId };

        } catch (error) {
            console.error('[OutboundCall] Error initiating call:', error);
            throw error;
        }
    }


    async handleOutboundCallConnected(waCallId, session, callbackData, phoneNumberId) {
        try {
            console.log(`[OutboundCall] Call ${waCallId} connected, answering...`);

            const { contact_id, agent_id, user_id } = callbackData;

            const agent = await WhatsappCallAgent.findById(agent_id);
            if (!agent) {
                throw new Error('Agent not found for outbound call');
            }

            const contact = await Contact.findById(contact_id);

            let callLog = await WhatsappCallLog.findOne({ wa_call_id: waCallId });
            if (!callLog) {
                callLog = await WhatsappCallLog.create({
                    user_id: user_id,
                    contact_id: contact_id,
                    phone_number_id: phoneNumberId,
                    agent_id: agent_id,
                    wa_call_id: waCallId,
                    status: 'answered',
                    call_type: 'outbound',
                    initiated_by: user_id,
                    trigger_reason: 'permission_granted'
                });
            } else {
                callLog.status = 'answered';
                await callLog.save();
            }


            await whatsappCallingService.connectOutboundCall(phoneNumberId, waCallId, session.sdp, agent, contact, callLog);

            console.log(`[OutboundCall] Call ${waCallId} answered successfully. Waiting for WebRTC connection...`);

            callAudioBuffers.set(waCallId, {
                samples: [],
                lastActivity: Date.now(),
                isSpeaking: false,
                speechSegments: 0,
                totalFramesProcessed: 0
            });

            const connected = await webrtcService.waitForConnection(waCallId);
            console.log(`[OutboundCall] WebRTC connection established: ${connected}`);


            if (agent.nodes && agent.nodes.length > 0) {
                console.log(`[OutboundCall] Executing first flow node for call ${waCallId}`);
                await this.executeNode(callLog, agent, agent.nodes[0]?.id, waCallId);
            } else if (agent.welcome_message) {
                console.log(`[Welcome] Playing welcome message: ${agent.welcome_message}`);
                await this.processTTS(agent, agent.welcome_message, callLog, waCallId);
            }

        } catch (error) {
            console.error('[OutboundCall] Error handling connected call:', error);
        }
    }


    async handleOutboundCallTerminated(waCallId, duration, reason) {
        try {
            const callLog = await WhatsappCallLog.findOne({ wa_call_id: waCallId });
            if (callLog) {
                callLog.status = 'completed';
                callLog.end_time = new Date();
                callLog.duration = duration || Math.floor((callLog.end_time - callLog.start_time) / 1000);
                await callLog.save();
                console.log(`[OutboundCall] Call ${waCallId} terminated with duration: ${callLog.duration}s`);
            }
        } catch (error) {
            console.error('[OutboundCall] Error handling call termination:', error);
        }
    }
}

export default new CallAutomationService();
