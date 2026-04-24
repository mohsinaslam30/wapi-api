import { Form, Submission, Contact, Message } from '../../models/index.js';

class MetaFlowService {
    async handleFlowSubmission(message, whatsappPhoneNumber, contactDoc) {
        try {
            console.log("message", message);
            const nfmReply = message.interactive?.nfm_reply;
            console.log("nfmReply", nfmReply);
            if (!nfmReply) return;

            console.log(" Received flow submission:", nfmReply);

            let flowId = nfmReply.flow_id || "";
            const flowToken = nfmReply.flow_token || "";
            const responseJsonStr = nfmReply.response_json || "{}";
            let data = {};
            try {
                data = JSON.parse(responseJsonStr);
            } catch (e) {
                console.error("Failed to parse nfm_reply response_json", e);
                return;
            }
            console.log("data", data);

            if (!flowId && message.context?.id) {
                const originalMessage = await Message.findOne({ wa_message_id: message.context.id }).lean();
                if (originalMessage?.interactive_data?.flowId) {
                    flowId = originalMessage.interactive_data.flowId;
                    console.log(`[MetaFlowService] Found flowId ${flowId} from original message`);
                }
            }

            if (!Object.keys(data).length) {
                console.warn("[MetaFlowService] Empty submission data");
                return;
            }

            const existing = await Submission.findOne({
                "meta.flow_token": flowToken
            });

            if (existing) {
                console.log("[MetaFlowService] Duplicate submission ignored");
                return;
            }

            const form = await Form.findOne({
                user_id: whatsappPhoneNumber.user_id,
                "flow.flow_id": flowId,
                deleted_at: null
            });

            if (!form) {
                console.warn(`[MetaFlowService] No form found matching flow_id: ${flowId}`);
                return;
            }

            const mappedFields = (form.fields || [])
                .map(field => {
                    console.log(`[MetaFlowService] Mapping field: ${field.name}, Available in data: ${Object.prototype.hasOwnProperty.call(data, field.name)}`);
                    if (Object.prototype.hasOwnProperty.call(data, field.name)) {
                        return {
                            field_id: field.id,
                            label: field.label || field.name,
                            value: data[field.name]
                        };
                    }
                    return null;
                })
                .filter(Boolean);

            console.log(`[MetaFlowService] Mapped ${mappedFields.length} fields out of ${form.fields?.length || 0}`);

            const submission = await Submission.create({
                form_id: form._id,
                user_id: form.user_id,
                waba_id: whatsappPhoneNumber?.waba_id?._id || whatsappPhoneNumber?.waba_id,
                data: data,
                fields: mappedFields,
                meta: {
                    phone_number: message.from,
                    flow_id: form.flow?.flow_id || "",
                    flow_token: flowToken || data.flow_token || "",
                    source: "whatsapp"
                },
                status: "new",
                submitted_at: new Date()
            });

            console.log(
                `[MetaFlowService] Submission ${submission._id} saved for form ${form.name}`
            );

            await Form.findByIdAndUpdate(form._id, { $inc: { "stats.submissions": 1 } });

            return submission;

        } catch (error) {
            console.error("[MetaFlowService] Error processing flow submission:", error);
        }
    }
}

export default new MetaFlowService();
