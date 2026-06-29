
export default class BaseProvider {

  async sendMessage(userId, params, connection = null) {
    throw new Error('sendMessage must be implemented by provider');
  }


  async getMessages(userId, contactNumber, connection = null) {
    throw new Error('getMessages must be implemented by provider');
  }


  async getConnectionStatus(userId, connection = null) {
    throw new Error('getConnectionStatus must be implemented by provider');
  }


  async initializeConnection(userId, connectionData = null) {
    throw new Error('initializeConnection must be implemented by provider');
  }


  async getQRCode(userId) {
    throw new Error('getQRCode not supported by this provider');
  }

  async getRecentChats(userId, connection = null) {
    throw new Error('getRecentChats must be implemented by provider');
  }

  async disconnect(userId, connection = null) {
    throw new Error('disconnect must be implemented by provider');
  }
}

  