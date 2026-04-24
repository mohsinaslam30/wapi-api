import pkg from '@roamhq/wrtc';
const { RTCPeerConnection } = pkg;
const { RTCAudioSource, RTCAudioSink } = pkg.nonstandard;
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import callAutomationService from './call-automation.service.js';
import whatsappCallingService from './whatsapp-calling.service.js';
import axios from 'axios';

const activeCalls = new Map();
const outputQueues = new Map();
const playbackIntervals = new Map();

const agentSpeaking = new Map();
const speechProcessing = new Map();

class WebRTCManager extends EventEmitter {
    constructor() {
        super();
        this.connections = new Map();
        this.callData = new Map();
        this.incomingAudioBuffers = new Map();
        this.outputQueues = outputQueues;
        this.playbackIntervals = playbackIntervals;
        this.outboundConnections = new Map();
    }

    async answerCall(waCallId, phoneNumberId, sdpOffer, agent, contact, callLog) {
        if (this.connections.has(waCallId)) {
            console.warn(`[WebRTC] answerCall called for ${waCallId} but connection already exists — skipping duplicate.`);
            return this.connections.get(waCallId)._lastSdpAnswer || '';
        }

        console.log(`[WebRTC] Initializing WebRTC connection for call ${waCallId}`);

        const wrtc = pkg;
        const pc = new RTCPeerConnection({
            sdpSemantics: 'unified-plan'
        });

        const audioSource = new RTCAudioSource();
        const outgoingTrack = audioSource.createTrack();
        pc.addTrack(outgoingTrack);

        const ssrcMatch = String(sdpOffer || '').match(/a=ssrc:(\d+)/);
        const ssrc = ssrcMatch ? (Number(ssrcMatch[1]) >>> 0) : (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);

        const outputQueue = [];
        outputQueues.set(waCallId, outputQueue);

        this.connections.set(waCallId, {
            pc,
            audioSource,
            ssrc,
            _lastSdpAnswer: ''
        });

        const playbackInterval = setInterval(() => {
            this.playAudioFrame(waCallId);
        }, 10);
        playbackIntervals.set(waCallId, playbackInterval);

        let latestTimestamp = 0;

        pc.ontrack = (event) => {
            console.log(`[WebRTC] Received audio track for call ${waCallId}`);

            const incomingTrack = event.track;
            const audioSink = new RTCAudioSink(incomingTrack);
            const conn = this.connections.get(waCallId);
            if (conn) conn.audioSink = audioSink;

            let frameCount = 0;
            let expectedSampleRate = null;

            audioSink.ondata = (data) => {
                frameCount++;
                latestTimestamp += 10;

                if (!expectedSampleRate) {
                    expectedSampleRate = data.sampleRate;
                    console.log(`[WebRTC] Incoming audio sample rate: ${expectedSampleRate}Hz`);
                }

                if (frameCount % 100 === 0) {
                    const rms = this.calculateRMS(data.samples);
                    console.log(`[WebRTC] Incoming audio RMS: ${rms.toFixed(2)} (frameCount: ${frameCount})`);
                }

                let samplesToProcess = data.samples;
                if (data.sampleRate !== 8000) {
                    samplesToProcess = this._resampleInt16(data.samples, data.sampleRate, 8000);
                }

                this._processIncomingAudio(waCallId, samplesToProcess, 8000, agent, callLog);
            };

            console.log(`[WebRTC] Audio sink created for call ${waCallId}`);
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') {
                console.error(`[WebRTC] ICE connection failed for ${waCallId}`);
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log(`[WebRTC] Connection state for ${waCallId} changed to: ${state}`);
            if (state === 'failed' || state === 'closed' || state === 'disconnected') {
                const data = this.callData.get(waCallId);
                if (data?.heartbeat) clearInterval(data.heartbeat);
                this.cleanup(waCallId);
            }
        };

        await pc.setRemoteDescription({ type: 'offer', sdp: sdpOffer });
        const answer = await pc.createAnswer();

        let modifiedSdp = answer.sdp.replace(/a=setup:actpass/g, 'a=setup:active');

        await pc.setLocalDescription({
            type: 'answer',
            sdp: modifiedSdp
        });

        const conn = this.connections.get(waCallId);
        if (conn) conn._lastSdpAnswer = modifiedSdp;

        return modifiedSdp;
    }

    playAudioFrame(waCallId) {
        const connection = this.connections.get(waCallId);
        if (!connection) return;

        const { audioSource } = connection;
        const outputQueue = outputQueues.get(waCallId);

        if (!outputQueue || outputQueue.length === 0) {
            const silence = new Int16Array(80).fill(0);
            try {
                audioSource.onData({
                    samples: silence,
                    sampleRate: 8000,
                    bitsPerSample: 16,
                    channelCount: 1,
                    numberOfFrames: 80
                });
            } catch (e) {}
            return;
        }

        const frame = outputQueue.shift();
        try {
            audioSource.onData({
                samples: frame,
                sampleRate: 8000,
                bitsPerSample: 16,
                channelCount: 1,
                numberOfFrames: 80
            });
        } catch (e) {}
    }

    _processIncomingAudio(waCallId, samples, sampleRate, agent, callLog) {
        let audioBuffer = this.incomingAudioBuffers.get(waCallId);

        if (!audioBuffer) {
            audioBuffer = {
                frames: [],
                lastActivity: Date.now(),
                isSpeaking: false,
                silenceCount: 0,
                totalFramesCaptured: 0
            };
            this.incomingAudioBuffers.set(waCallId, audioBuffer);
        }

        const rms = this.calculateRMS(samples);

        const SPEECH_THRESHOLD = 50;
        const SILENCE_THRESHOLD = 30;

        if (audioBuffer.totalFramesCaptured % 100 === 0) {
            console.log(`[WebRTC] Debug - RMS: ${rms.toFixed(2)}, isSpeaking: ${audioBuffer.isSpeaking}, frames: ${audioBuffer.frames.length}, agentSpeaking: ${!!agentSpeaking.get(waCallId)}`);
        }

        audioBuffer.totalFramesCaptured++;

        if (rms > SPEECH_THRESHOLD) {
            audioBuffer.isSpeaking = true;
            audioBuffer.silenceCount = 0;
            audioBuffer.frames.push(new Int16Array(samples));
            audioBuffer.lastActivity = Date.now();

            if (audioBuffer.frames.length % 50 === 0) {
                console.log(`[WebRTC] Capturing speech... Frames collected: ${audioBuffer.frames.length}`);
            }
        } else if (rms < SILENCE_THRESHOLD && audioBuffer.isSpeaking) {
            audioBuffer.silenceCount++;

            const MIN_SPEECH_FRAMES = 40;

            if (audioBuffer.silenceCount >= 20 && audioBuffer.frames.length >= MIN_SPEECH_FRAMES) {
                if (agentSpeaking.get(waCallId)) {
                    console.log(`[WebRTC] Agent is speaking; discarding ${audioBuffer.frames.length} captured frames (echo/background suppression).`);
                    audioBuffer.frames = [];
                    audioBuffer.isSpeaking = false;
                    audioBuffer.silenceCount = 0;
                } else if (speechProcessing.get(waCallId)) {
                    console.log(`[WebRTC] Speech still being processed; discarding ${audioBuffer.frames.length} frames.`);
                    audioBuffer.frames = [];
                    audioBuffer.isSpeaking = false;
                    audioBuffer.silenceCount = 0;
                } else {
                    const framesToProcess = [...audioBuffer.frames];
                    audioBuffer.frames = [];
                    audioBuffer.isSpeaking = false;
                    audioBuffer.silenceCount = 0;

                    console.log(`[WebRTC] End of speech detected. Processing ${framesToProcess.length} frames (${(framesToProcess.length * 10 / 1000).toFixed(1)}s)`);

                    this._processSpeech(waCallId, agent, callLog, framesToProcess)
                        .catch(err => console.error('[WebRTC] Speech processing error:', err));
                }
            } else if (audioBuffer.silenceCount >= 20 && audioBuffer.frames.length < MIN_SPEECH_FRAMES) {
                audioBuffer.frames = [];
                audioBuffer.isSpeaking = false;
                audioBuffer.silenceCount = 0;
            }
        } else {
            if (audioBuffer.isSpeaking && rms >= SILENCE_THRESHOLD) {
                audioBuffer.frames.push(new Int16Array(samples));
                audioBuffer.lastActivity = Date.now();
            }
        }

        const MIN_SPEECH_FRAMES_TIMEOUT = 60;
        if (audioBuffer.frames.length >= MIN_SPEECH_FRAMES_TIMEOUT && Date.now() - audioBuffer.lastActivity > 4000) {
            if (!agentSpeaking.get(waCallId) && !speechProcessing.get(waCallId)) {
                const framesToProcess = [...audioBuffer.frames];
                audioBuffer.frames = [];
                audioBuffer.isSpeaking = false;
                audioBuffer.silenceCount = 0;

                console.log(`[WebRTC] Speech timeout. Processing ${framesToProcess.length} frames`);

                this._processSpeech(waCallId, agent, callLog, framesToProcess)
                    .catch(err => console.error('[WebRTC] Speech processing error:', err));
            } else {
                audioBuffer.frames = [];
                audioBuffer.isSpeaking = false;
            }
        }

        if (audioBuffer.frames.length > 300) {
            console.warn(`[WebRTC] Audio buffer overflow (${audioBuffer.frames.length} frames), clearing...`);
            audioBuffer.frames = [];
            audioBuffer.isSpeaking = false;
        }
    }

    calculateRMS(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        return Math.sqrt(sum / samples.length);
    }

    generateWavBuffer(pcmBuffer, sampleRate = 8000, channels = 1, bitsPerSample = 16) {
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


    async _processSpeech(waCallId, agent, callLog, opusFrames) {
        speechProcessing.set(waCallId, true);
        try {
            console.log(`[WebRTC] Processing speech for call ${waCallId}. Frames: ${opusFrames.length}`);

            if (agent.recording_config?.enable_user_recording) {
                try {
                    const recordingsDir = path.join(process.cwd(), 'uploads', 'recordings');
                    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

                    const pcmBuffer = Buffer.concat(opusFrames.map(frame => {
                        const buf = Buffer.alloc(frame.length * 2);
                        for (let i = 0; i < frame.length; i++) {
                            buf.writeInt16LE(frame[i], i * 2);
                        }
                        return buf;
                    }));

                    const wavBuffer = this.generateWavBuffer(pcmBuffer, 8000, 1, 16);
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const filename = `user_${waCallId}_${timestamp}.wav`;
                    const audioFilePath = path.join(recordingsDir, filename);
                    fs.writeFileSync(audioFilePath, wavBuffer);
                    console.log(`[WebRTC] Saved user audio: ${audioFilePath} (${(pcmBuffer.length / (8000 * 2)).toFixed(2)}s at 8kHz)`);

                    callLog.recordings = callLog.recordings || { user: [], agent: [] };
                    if (!Array.isArray(callLog.recordings.user)) callLog.recordings.user = [];
                    callLog.recordings.user.push(`/uploads/recordings/${filename}`);
                    await callLog.save();
                } catch (saveErr) {
                    console.error('[WebRTC] Error saving audio:', saveErr.message);
                }
            }

            const transcribedText = await callAutomationService.processSTT(agent, opusFrames, waCallId);
            console.log(`[WebRTC] Transcribed: "${transcribedText}"`);

            if (transcribedText && transcribedText.trim().length > 0) {
                await callAutomationService.handleUserSpeech(waCallId, transcribedText);
            }
        } catch (err) {
            console.error('[WebRTC] Error processing speech:', err.message);
            console.error('[WebRTC] Error stack:', err.stack);
        } finally {
            speechProcessing.set(waCallId, false);
        }
    }


    async playAudio(waCallId, pcmBuffer) {
        const connection = this.connections.get(waCallId);
        if (!connection) {
            console.warn(`[WebRTC] playAudio: no connection found for ${waCallId}`);
            return;
        }

        const outputQueue = outputQueues.get(waCallId);
        if (!outputQueue) return;

        console.log(`[WebRTC] Queueing audio to ${waCallId}. PCM size: ${pcmBuffer.length} bytes`);

        const pcmInput = new Int16Array(
            pcmBuffer.buffer,
            pcmBuffer.byteOffset,
            pcmBuffer.length / 2
        );

        console.log(`[WebRTC] Input samples: ${pcmInput.length}, Sample rate likely 16000Hz`);

        const pcm8k = this._resampleInt16(pcmInput, 16000, 8000);

        console.log(`[WebRTC] Resampled to ${pcm8k.length} samples at 8kHz (${(pcm8k.length / 8000).toFixed(2)}s)`);

        agentSpeaking.set(waCallId, true);

        const FRAME_SIZE = 80;
        const totalFrames = Math.ceil(pcm8k.length / FRAME_SIZE);
        for (let i = 0; i < pcm8k.length; i += FRAME_SIZE) {
            const frame = new Int16Array(FRAME_SIZE);
            const remaining = Math.min(FRAME_SIZE, pcm8k.length - i);

            for (let j = 0; j < remaining; j++) {
                frame[j] = pcm8k[i + j];
            }

            outputQueue.push(frame);
        }

        console.log(`[WebRTC] Queued ${totalFrames} frames to ${waCallId}`);

        const estimatedDurationMs = totalFrames * 10 + 800;
        setTimeout(() => {
            if (this.connections.has(waCallId)) {
                if (!outputQueue || outputQueue.length === 0) {
                    agentSpeaking.set(waCallId, false);
                    console.log(`[WebRTC] Agent speaking lock released for ${waCallId}`);
                }
            }
        }, estimatedDurationMs);
    }

    _resample(input, srcRate, dstRate, channels = 1) {
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

    _resampleInt16(input, srcRate, dstRate) {
        const ratio = dstRate / srcRate;
        const outputLength = Math.floor(input.length * ratio);
        const output = new Int16Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i / ratio;
            const srcFloor = Math.floor(srcIndex);
            const srcCeil = Math.min(srcFloor + 1, input.length - 1);
            const t = srcIndex - srcFloor;

            output[i] = Math.round(input[srcFloor] * (1 - t) + input[srcCeil] * t);
        }

        return output;
    }

    _resampleAndDownmix(input, srcRate, dstRate) {
        const bytesPerSample = 2;
        const inputChannels = 2;
        const outputChannels = 1;

        const inputSamples = Math.floor(input.length / (bytesPerSample * inputChannels));
        const outputSamples = Math.floor(inputSamples * dstRate / srcRate);
        const output = Buffer.alloc(outputSamples * bytesPerSample * outputChannels);

        for (let i = 0; i < outputSamples; i++) {
            const srcFrac = (i / outputSamples) * inputSamples;
            const srcIdxA = Math.min(Math.floor(srcFrac), inputSamples - 1);
            const srcIdxB = Math.min(srcIdxA + 1, inputSamples - 1);
            const t = srcFrac - srcIdxA;

            const leftA = input.readInt16LE((srcIdxA * inputChannels) * bytesPerSample);
            const rightA = input.readInt16LE((srcIdxA * inputChannels + 1) * bytesPerSample);
            const leftB = input.readInt16LE((srcIdxB * inputChannels) * bytesPerSample);
            const rightB = input.readInt16LE((srcIdxB * inputChannels + 1) * bytesPerSample);

            const sampleA = Math.round((leftA + rightA) / 2);
            const sampleB = Math.round((leftB + rightB) / 2);
            const out = Math.round(sampleA + t * (sampleB - sampleA));
            const clamped = Math.max(-32768, Math.min(32767, out));

            output.writeInt16LE(clamped, i * bytesPerSample);
        }
        return output;
    }

    cleanup(waCallId) {
        const connection = this.connections.get(waCallId);
        if (connection) {
            const { pc, audioSource } = connection;

            const playbackInterval = playbackIntervals.get(waCallId);
            if (playbackInterval) {
                clearInterval(playbackInterval);
                playbackIntervals.delete(waCallId);
            }

            outputQueues.delete(waCallId);

            this.incomingAudioBuffers.delete(waCallId);

            if (audioSource && typeof audioSource.stop === 'function') audioSource.stop();
            if (connection.audioSink && typeof connection.audioSink.stop === 'function') connection.audioSink.stop();
            if (pc && typeof pc.close === 'function') pc.close();

            this.connections.delete(waCallId);
        }

        agentSpeaking.delete(waCallId);
        speechProcessing.delete(waCallId);

        const data = this.callData.get(waCallId);
        if (data?.heartbeat) clearInterval(data.heartbeat);
        this.callData.delete(waCallId);
        console.log(`[WebRTC] Cleaned up call ${waCallId}`);
    }


    storeOutboundConnection(callId, pc, audioSource, phoneNumberId) {
        this.outboundConnections.set(callId, { pc, audioSource, phoneNumberId });
        console.log(`[WebRTC] Stored outbound connection for ${callId}`);
    }


    async connectOutboundCall(waCallId, sdpAnswer, agent, contact, callLog) {
        const outboundConn = this.outboundConnections.get(waCallId);
        if (!outboundConn) {
            console.error(`[WebRTC] No outbound connection found for ${waCallId}`);
            return;
        }

        const { pc, audioSource, phoneNumberId } = outboundConn;
        this.outboundConnections.delete(waCallId);

        console.log(`[WebRTC] Connecting outbound call ${waCallId}`);

        const outputQueue = [];
        outputQueues.set(waCallId, outputQueue);

        this.connections.set(waCallId, {
            pc,
            audioSource,
            phoneNumberId,
            agent,
            contact,
            callLog
        });

        const playbackInterval = setInterval(() => {
            this.playAudioFrame(waCallId);
        }, 10);
        playbackIntervals.set(waCallId, playbackInterval);

        let latestTimestamp = 0;

        pc.ontrack = (event) => {
            console.log(`[WebRTC] Received audio track for call ${waCallId}`);

            const incomingTrack = event.track;
            const audioSink = new RTCAudioSink(incomingTrack);
            const conn = this.connections.get(waCallId);
            if (conn) conn.audioSink = audioSink;

            let frameCount = 0;
            let expectedSampleRate = null;

            audioSink.ondata = (data) => {
                frameCount++;
                latestTimestamp += 10;

                if (!expectedSampleRate) {
                    expectedSampleRate = data.sampleRate;
                    console.log(`[WebRTC] Incoming audio sample rate: ${expectedSampleRate}Hz`);
                }

                if (frameCount % 100 === 0) {
                    const rms = this.calculateRMS(data.samples);
                    // console.log(`[WebRTC] Incoming audio RMS: ${rms.toFixed(2)} (frameCount: ${frameCount})`);
                }

                let samplesToProcess = data.samples;
                if (data.sampleRate !== 8000) {
                    samplesToProcess = this._resampleInt16(data.samples, data.sampleRate, 8000);
                }

                this._processIncomingAudio(waCallId, samplesToProcess, 8000, agent, callLog);
            };

            console.log(`[WebRTC] Audio sink created for call ${waCallId}`);
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') {
                console.error(`[WebRTC] ICE connection failed for ${waCallId}`);
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log(`[WebRTC] Connection state for ${waCallId} changed to: ${state}`);
            if (state === 'failed' || state === 'closed' || state === 'disconnected') {
                this.cleanup(waCallId);
            }
        };

        await pc.setRemoteDescription({
            type: 'answer',
            sdp: sdpAnswer
        });

        console.log(`[WebRTC] Outbound call ${waCallId} remote description set`);
    }

    async waitForConnection(waCallId, timeout = 10000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const conn = this.connections.get(waCallId);
            if (conn && conn.pc) {
                if (conn.pc.connectionState === 'connected') {
                    return true;
                }
                if (conn.pc.connectionState === 'failed' || conn.pc.connectionState === 'closed') {
                    return false;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        return false;
    }


    getOutboundConnection(callId) {
        return this.outboundConnections.get(callId);
    }

    cleanupOutboundConnection(callId) {
        const conn = this.outboundConnections.get(callId);
        if (conn) {
            const { pc, audioSource } = conn;

            if (audioSource && typeof audioSource.stop === 'function') {
                audioSource.stop();
            }

            if (pc && typeof pc.close === 'function') {
                pc.close();
            }

            this.outboundConnections.delete(callId);
            console.log(`[WebRTC] Cleaned up outbound connection for ${callId}`);
        }
    }
}

export default new WebRTCManager();
