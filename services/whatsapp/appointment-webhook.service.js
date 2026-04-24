import appointmentService from '../appointment.service.js';
import automationEngine from '../../utils/automation-engine.js';
import { Contact } from '../../models/index.js';

class AppointmentWebhookService {
  async handleFlowResponse(message, contactDoc) {
    try {
      const nfmReply = message.interactive?.nfm_reply;
      if (!nfmReply) return false;

      const responseData = JSON.parse(nfmReply.response_json || "{}");
      const metadata = contactDoc.metadata || {};

      if (metadata.automation_waiting_type !== 'appointment_flow') {
        return false;
      }

      console.log(`[AppointmentWebhook] Processing flow response for contact: ${contactDoc._id}`);

      const { selected_date, selected_slot_start, selected_slot_end, ...customAnswers } = responseData;

      if (!selected_date || !selected_slot_start) {
         console.warn("[AppointmentWebhook] Missing date or slot in flow response");
         return false;
      }

      const booking = await appointmentService.createBooking({
        configId: metadata.automation_waiting_config_id,
        contactId: contactDoc._id,
        userId: contactDoc.user_id,
        startTime: selected_slot_start,
        endTime: selected_slot_end,
        answers: customAnswers
      });

      console.log(`[AppointmentWebhook] Booking created: ${booking._id}`);

      const originalInputData = JSON.parse(metadata.automation_input_data || "{}");
      const updatedData = {
        ...originalInputData,
        appointment_id: booking._id,
        appointment_start: selected_slot_start,
        appointment_end: selected_slot_end,
        google_meet_link: booking.google_meet_link || '',
        flow_response: responseData
      };

      contactDoc.metadata.automation_waiting_type = null;
      contactDoc.metadata.automation_waiting_node_id = null;
      await contactDoc.save();

      const flowId = metadata.automation_waiting_flow_id;
      const nodeId = metadata.automation_waiting_node_id;

      const { AutomationFlow } = await import('../../models/index.js');
      const flow = await AutomationFlow.findById(flowId).lean();

      if (flow && nodeId) {
        const currentNode = flow.nodes.find(n => n.id === nodeId);
        if (currentNode) {
          console.log(`[AppointmentWebhook] Resuming flow ${flowId} from node ${nodeId}`);
          await automationEngine.processConnectedNodes(flow, currentNode, updatedData, []);
        }
      }

      return true;
    } catch (error) {
      console.error("[AppointmentWebhook] Error handling flow response:", error);
      return false;
    }
  }
}

export default new AppointmentWebhookService();
