import { WhatsappCallSetting, WhatsappCallAgent, WhatsappCallLog, Contact, WhatsappPhoneNumber } from '../models/index.js';
import axios from 'axios';
import whatsappCallingService from '../services/whatsapp/whatsapp-calling.service.js';

class WhatsappCallingController {
    async getCallSettings(req, res) {
        try {
            const { phone_number_id } = req.query;
            const settings = await WhatsappCallSetting.findOne({
                phone_number_id,
                user_id: req.user._id,
                deleted_at: null
            }).populate('fallback_agent_id');

            if (!settings) {
                return res.status(404).json({ message: 'Call settings not found for this phone number' });
            }

            res.status(200).json(settings);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async updateCallSettings(req, res) {
        try {
            const { phone_number_id, ...updateData } = req.body;
            const userId = req.user._id;


            console.log("phone_number_id" , phone_number_id , userId);
            const phone = await WhatsappPhoneNumber.findOne({
                _id: phone_number_id,
                user_id: userId,
                deleted_at: null
            });
            console.log("phone" , phone);

            if (!phone) {
                return res.status(403).json({
                    message: 'Forbidden: You do not own this phone number or it does not exist.'
                });
            }

            let settings = await WhatsappCallSetting.findOne({
                phone_number_id,
                user_id: userId,
                deleted_at: null
            });
            if (settings) {
                Object.assign(settings, updateData);
                await settings.save();
            } else {
                settings = await WhatsappCallSetting.create({
                    ...updateData,
                    phone_number_id,
                    user_id: userId
                });
            }

            try {
                console.log("calledd")
                await whatsappCallingService.updateCallConfig(phone_number_id, settings);
            } catch (syncError) {
                console.warn('Failed to sync call settings with WhatsApp:', syncError.message);
            }

            res.status(200).json(settings);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async createCallAgent(req, res) {
        try {
            const agent = await WhatsappCallAgent.create({
                ...req.body,
                user_id: req.user._id
            });
            res.status(201).json(agent);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async getCallAgents(req, res) {
        try {
            const { page = 1, limit = 10, search = '', sort_by = 'created_at', sort_order = 'desc' } = req.query;
            const query = {
                user_id: req.user._id,
                deleted_at: null
            };

            if (search) {
                query.name = { $regex: search, $options: 'i' };
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const sort = { [sort_by]: sort_order === 'desc' ? -1 : 1 };

            const agents = await WhatsappCallAgent.find(query)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit));

            const totalItems = await WhatsappCallAgent.countDocuments(query);

            res.status(200).json({
                data: agents,
                pagination: {
                    totalItems,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(totalItems / limit)
                }
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async updateCallAgent(req, res) {
        try {
            const { id } = req.params;
            const agent = await WhatsappCallAgent.findOneAndUpdate(
                { _id: id, user_id: req.user._id, deleted_at: null },
                req.body,
                { returnDocument: 'after' }
            );
            if (!agent) return res.status(404).json({ message: 'Agent not found' });
            res.status(200).json(agent);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async getCallAgentById(req, res) {
        try {
            const { id } = req.params;
            const agent = await WhatsappCallAgent.findOne({
                _id: id,
                user_id: req.user._id,
                deleted_at: null
            }).lean();
            if (!agent) return res.status(404).json({ message: 'Agent not found' });

            const assignedContacts = await Contact.find({
                assigned_call_agent_id: id,
                deleted_at: null
            }).select('_id');

            agent.contacts_ids = assignedContacts.map(c => c._id);

            res.status(200).json(agent);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async deleteCallAgent(req, res) {
        try {
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ message: 'Please provide an array of agent IDs' });
            }

            const result = await WhatsappCallAgent.updateMany(
                { _id: { $in: ids }, user_id: req.user._id },
                { deleted_at: new Date() }
            );

            res.status(200).json({
                success: true,
                message: `${result.modifiedCount || result.nModified} agent(s) deleted successfully`,
                deleted_ids: ids
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async getCallLogs(req, res) {
        try {
            const { page = 1, limit = 10, search = '', agentId, contact_id, phone_number_id } = req.query;
            const query = { user_id: req.user._id };
            
            if (agentId) query.agent_id = agentId;
            if (contact_id) query.contact_id = contact_id;
            if (phone_number_id) query.phone_number_id = phone_number_id;

            if (search) {
                query.$or = [
                    { whatsapp_user_id: { $regex: search, $options: 'i' } },
                    { call_sid: { $regex: search, $options: 'i' } }
                ];
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);

            const logs = await WhatsappCallLog.find(query)
                .select('-last_api_context -recordings -phone_number_id -transcription -transcription_json -nodes_executed -triggered_functions')
                .populate('agent_id', 'name')
                .populate('contact_id', 'name phone_number')
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(parseInt(limit));

            const totalItems = await WhatsappCallLog.countDocuments(query);

            res.status(200).json({
                data: logs,
                pagination: {
                    totalItems,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(totalItems / limit)
                }
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async getCallTranscription(req, res) {
        try {
            const { id } = req.params;
            const log = await WhatsappCallLog.findOne({ _id: id, user_id: req.user._id });
            if (!log) return res.status(404).json({ message: 'Call log not found' });
            res.status(200).json({ transcription: log.transcription, recording_url: log.recording_url });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async assignAgentToContact(req, res) {
        try {
            const { contact_id, agent_id } = req.body;
            const contact = await Contact.findOneAndUpdate(
                { _id: contact_id, created_by: req.user._id },
                { assigned_call_agent_id: agent_id },
                { returnDocument: 'after' }
            );
            if (!contact) return res.status(404).json({ message: 'Contact not found' });
            res.status(200).json(contact);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }


    async assignAgentBulk(req, res) {
        try {
            const { agent_id, contact_ids, tag_ids } = req.body;
            const userId = req.user._id;

            if (!agent_id) {
                return res.status(400).json({ message: 'agent_id is required' });
            }

            const agent = await WhatsappCallAgent.findOne({
                _id: agent_id,
                user_id: userId,
                deleted_at: null
            });

            if (!agent) {
                return res.status(404).json({ message: 'Call agent not found' });
            }

            let updatedCount = 0;
            let notFoundIds = [];


            if (contact_ids && Array.isArray(contact_ids) && contact_ids.length > 0) {
                const contacts = await Contact.find({
                    _id: { $in: contact_ids },
                    created_by: userId
                }).select('_id');

                const foundIds = contacts.map(c => c._id.toString());
                notFoundIds = contact_ids.filter(id => !foundIds.includes(id.toString()));

                const result = await Contact.updateMany(
                    {
                        _id: { $in: foundIds },
                        created_by: userId
                    },
                    {
                        $set: { assigned_call_agent_id: agent_id }
                    }
                );

                updatedCount = result.modifiedCount || result.nModified;
            }

            else if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
                const result = await Contact.updateMany(
                    {
                        created_by: userId,
                        tags: { $in: tag_ids }
                    },
                    {
                        $set: { assigned_call_agent_id: agent_id }
                    }
                );

                updatedCount = result.modifiedCount || result.nModified;
            }
            else {
                return res.status(400).json({
                    message: 'Either contact_ids or tag_ids must be provided'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Agent assigned successfully',
                data: {
                    updated_count: updatedCount,
                    agent_id: agent_id,
                    agent_name: agent.name
                },
                ...(notFoundIds.length > 0 && { not_found_ids: notFoundIds })
            });
        } catch (error) {
            console.error('Error assigning agent bulk:', error);
            res.status(500).json({ message: error.message });
        }
    }


    async removeAgentFromContact(req, res) {
        try {
            const { contact_id } = req.params;
            const userId = req.user._id;

            const contact = await Contact.findOneAndUpdate(
                { _id: contact_id, created_by: userId },
                { $unset: { assigned_call_agent_id: '' } },
                { returnDocument: 'after' }
            );

            if (!contact) {
                return res.status(404).json({ message: 'Contact not found' });
            }

            res.status(200).json({
                success: true,
                message: 'Call agent removed from contact',
                contact
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }


    async removeAgentBulk(req, res) {
        try {
            const { contact_ids, tag_ids } = req.body;
            const userId = req.user._id;

            let removedCount = 0;
            let notFoundIds = [];

            if (contact_ids && Array.isArray(contact_ids) && contact_ids.length > 0) {
                const contacts = await Contact.find({
                    _id: { $in: contact_ids },
                    created_by: userId
                }).select('_id');

                const foundIds = contacts.map(c => c._id.toString());
                notFoundIds = contact_ids.filter(id => !foundIds.includes(id.toString()));

                const result = await Contact.updateMany(
                    {
                        _id: { $in: foundIds },
                        created_by: userId,
                        assigned_call_agent_id: { $exists: true }
                    },
                    {
                        $unset: { assigned_call_agent_id: '' }
                    }
                );

                removedCount = result.modifiedCount || result.nModified;
            }
            else if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
                const result = await Contact.updateMany(
                    {
                        created_by: userId,
                        tags: { $in: tag_ids },
                        assigned_call_agent_id: { $exists: true }
                    },
                    {
                        $unset: { assigned_call_agent_id: '' }
                    }
                );

                removedCount = result.modifiedCount || result.nModified;
            }
            else {
                return res.status(400).json({
                    message: 'Either contact_ids or tag_ids must be provided'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Call agent removed successfully',
                data: {
                    removed_count: removedCount
                },
                ...(notFoundIds.length > 0 && { not_found_ids: notFoundIds })
            });
        } catch (error) {
            console.error('Error removing agent bulk:', error);
            res.status(500).json({ message: error.message });
        }
    }


    async getCallLogById(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user._id;

            const callLog = await WhatsappCallLog.findOne({
                _id: id,
                user_id: userId
            })
                .select('-last_api_context')
                .populate('agent_id', 'name')
                .populate('contact_id')
                .populate('phone_number_id');

            if (!callLog) {
                return res.status(404).json({ message: 'Call log not found' });
            }

            res.status(200).json(callLog);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async bulkDeleteCallLogs(req, res) {
        try {
            const userId = req.user._id;
            const { ids } = req.body;

            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide an array of call log IDs'
                });
            }

            const callLogs = await WhatsappCallLog.find({
                _id: { $in: ids },
                user_id: userId
            }).select('_id');

            const foundIds = callLogs.map(log => log._id.toString());
            const notFoundIds = ids.filter(id => !foundIds.includes(id.toString()));

            const result = await WhatsappCallLog.updateMany(
                {
                    _id: { $in: foundIds },
                    user_id: userId
                },
                {
                    $set: { deleted_at: new Date() }
                }
            );

            const response = {
                success: true,
                message: 'Call logs deleted successfully',
                data: {
                    deleted_count: result.modifiedCount || result.nModified,
                    deleted_ids: foundIds
                }
            };

            if (notFoundIds.length > 0) {
                response.data.not_found_ids = notFoundIds;
            }

            res.status(200).json(response);
        } catch (error) {
            console.error('Error bulk deleting call logs:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to bulk delete call logs',
                details: error.message
            });
        }
    }
}

export default new WhatsappCallingController();
