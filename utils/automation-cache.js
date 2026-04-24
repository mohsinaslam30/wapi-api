import NodeCache from 'node-cache';
import { AutomationFlow } from '../models/index.js';

class AutomationCache {
  constructor() {
    this.flowCache = new NodeCache({ stdTTL: 300 });
    this.executionCache = new NodeCache({ stdTTL: 60 });
    this.triggerCache = new NodeCache({ stdTTL: 120 });
    this.nodeTypesCache = new NodeCache({ stdTTL: 3600 });
  }


  setFlow(flowId, flowData) {
    const plainFlowData = flowData && typeof flowData.toObject === 'function'
      ? flowData.toObject()
      : flowData;
    return this.flowCache.set(flowId, plainFlowData);
  }


  getFlow(flowId) {
    return this.flowCache.get(flowId);
  }


  deleteFlow(flowId) {
    return this.flowCache.del(flowId);
  }


  setExecution(executionId, executionData) {
    const plainExecutionData = executionData && typeof executionData.toObject === 'function'
      ? executionData.toObject()
      : executionData;
    return this.executionCache.set(executionId, plainExecutionData);
  }


  getExecution(executionId) {
    return this.executionCache.get(executionId);
  }


  setTriggers(userId, triggers) {
    const plainTriggers = triggers && Array.isArray(triggers)
      ? triggers.map(trigger =>
          trigger && typeof trigger.toObject === 'function'
            ? trigger.toObject()
            : trigger
        )
      : triggers;
    return this.triggerCache.set(`triggers_${userId}`, plainTriggers);
  }


  getTriggers(userId) {
    return this.triggerCache.get(`triggers_${userId}`);
  }


  getNodeTypes() {
    return this.nodeTypesCache.get('node_types');
  }


  setNodeTypes(nodeTypes) {
    return this.nodeTypesCache.set('node_types', nodeTypes);
  }


  clearUserCache(userId) {
    this.triggerCache.del(`triggers_${userId}`);

    return {
      clearFlowCache: (flowId) => this.deleteFlow(flowId),
      clearAllCaches: () => {
        this.flowCache.flushAll();
        this.executionCache.flushAll();
        this.triggerCache.flushAll();
      }
    };
  }


  async preloadUserFlows(userId) {
    try {
      const flows = await AutomationFlow.find({
        user_id: userId,
        is_active: true,
        deleted_at: null
      });

      flows.forEach(flow => {
        if (flow && flow._id) {
          this.setFlow(flow._id.toString(), flow);
        }
      });

      const triggers = [];
      flows.forEach(flow => {
        if (flow && Array.isArray(flow.triggers)) {
          flow.triggers.forEach(trigger => {
            if (trigger) {
              triggers.push({
                ...trigger,
                flow_id: flow._id
              });
            }
          });
        }
      });

      this.setTriggers(userId, triggers);

      return flows.length;
    } catch (error) {
      console.error('Error preloading user flows:', error);
      console.error('Error stack:', error.stack);
      return 0;
    }
  }


  async getUserActiveFlows(userId) {
    console.log(`Getting active flows for user: ${userId}`);
    const cachedTriggers = this.getTriggers(userId);
    if (cachedTriggers && cachedTriggers.length > 0) {
      console.log(`Found ${cachedTriggers.length} cached triggers for user ${userId}`);
      return cachedTriggers;
    }

    console.log(`Loading active flows from DB for user: ${userId}`);
    const flows = await AutomationFlow.find({
      user_id: userId,
      is_active: true,
      deleted_at: null
    });
    console.log(`Found ${flows.length} active flows for user: ${userId}`);

    flows.forEach(flow => {
      console.log("floww===============" , flow);
      this.setFlow(flow._id.toString(), flow);
    });

    console.log(`==============Yeah Found`);
    const triggers = [];
    flows.forEach(flow => {
      if (flow && Array.isArray(flow.triggers)) {
        flow.triggers.forEach(trigger => {
          if (trigger) {
            const plainTrigger = trigger.toObject ? trigger.toObject() : trigger;
            triggers.push({
              ...plainTrigger,
              flow_id: flow._id
            });
          }
        });
      }
    });

    console.log(`Found ${triggers.length} triggers for user: ${userId}`);
    this.setTriggers(userId, triggers);
    return triggers;
  }


  invalidateFlowCache(flowId, userId) {
    this.deleteFlow(flowId);
    this.triggerCache.del(`triggers_${userId}`);
  }


  getStats() {
    return {
      flowCache: this.flowCache.getStats(),
      executionCache: this.executionCache.getStats(),
      triggerCache: this.triggerCache.getStats(),
      nodeTypesCache: this.nodeTypesCache.getStats()
    };
  }


  async preloadAllUserFlows() {
    try {
      const userIds = await AutomationFlow.distinct('user_id', { is_active: true, deleted_at: null });
      console.log(`Preloading flows for ${userIds.length} users`);

      for (const userId of userIds) {
        const count = await this.preloadUserFlows(userId);
        console.log(`Preloaded ${count} flows for user ${userId}`);
      }

      return userIds.length;
    } catch (error) {
      console.error('Error preloading all user flows:', error);
      return 0;
    }
  }
}

const automationCache = new AutomationCache();

export default automationCache;
