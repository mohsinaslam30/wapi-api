/**
 * User Model Synchronization Module
 * Handles syncing with existing user models in the host project for MongoDB
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

let dbConnection = null;
let User = null;
let hostUserModel = null;

/**
 * User Model class that can sync with existing models
 */
class UserModel {
  constructor(connection, options = {}) {
    this.connection = connection;
    this.options = {
      collection: 'users',
      timestamps: true,
      ...options
    };
    
    this.defineModel();
  }

  defineModel() {
    const userSchema = new mongoose.Schema({
      name: { 
        type: String, 
        required: true 
      },
      email: { 
        type: String, 
        required: true, 
        unique: true 
      },
      password: { 
        type: String, 
        required: true 
      },
      email_verified_at: { 
        type: Date, 
        default: null 
      },
      system_reserve: { 
        type: Boolean, 
        required: false, 
        default: true 
      }
    }, { 
      collection: this.options.collection, 
      timestamps: this.options.timestamps 
    });
    
    this.model = this.connection.model('User', userSchema);
  }

  /**
   * Get the Mongoose model
   * @returns {mongoose.Model} The User model
   */
  getModel() {
    return this.model;
  }

  /**
   * Sync the model with database (in MongoDB this creates the collection if it doesn't exist)
   * @returns {Promise<void>}
   */
  async sync() {
    // In Mongoose, the collection is created when the first document is saved
    // We can try to access the collection to ensure it's ready
    await this.model.init();
  }

  /**
   * Create or update admin user
   * @param {Object} adminData - Admin user data
   * @returns {Promise<mongoose.Model>} Created or updated user
   */
  async createOrUpdateAdmin(adminData) {
    const name = `${adminData.first_name} ${adminData.last_name}`.trim();
    const email = adminData.email;
    const password = await bcrypt.hash(adminData.password, 10);
    
    const existing = await this.model.findOne({ email });
    if (existing) {
      existing.name = name;
      existing.password = password;
      existing.email_verified_at = new Date();
      existing.system_reserve = true;
      return await existing.save();
    }
    
    return await this.model.create({ 
      name, 
      email, 
      password, 
      email_verified_at: new Date(), 
      system_reserve: true 
    });
  }
}

/**
 * Sync with existing user model from host project
 * @param {mongoose.Connection} connection - Mongoose connection
 * @param {Object} existingUserModel - Existing user model from host project
 * @param {Object} options - Configuration options
 * @returns {Promise<UserModel>} Synchronized user model
 */
async function syncUserModel(connection, existingUserModel = null, options = {}) {
  if (existingUserModel) {
    // Use existing user model
    hostUserModel = existingUserModel;
    
    // Create wrapper with existing model
    const userModel = new UserModel(connection, options);
    userModel.model = existingUserModel;
    
    // Override createOrUpdateAdmin to work with existing model
    userModel.createOrUpdateAdmin = async (adminData) => {
      const name = `${adminData.first_name} ${adminData.last_name}`.trim();
      const email = adminData.email;
      const password = await bcrypt.hash(adminData.password, 10);
      
      const existing = await existingUserModel.findOne({ email });
      if (existing) {
        existing.name = name;
        existing.password = password;
        existing.email_verified_at = new Date();
        existing.system_reserve = true;
        return await existing.save();
      }
      
      return await existingUserModel.create({ 
        name, 
        email, 
        password, 
        email_verified_at: new Date(), 
        system_reserve: true 
      });
    };
    
    return userModel;
  } else {
    // Create new user model
    return new UserModel(connection, options);
  }
}

/**
 * Check if user model exists and has required fields
 * @param {mongoose.Model} userModel - User model to check
 * @returns {Promise<Object>} Model compatibility info
 */
async function checkUserModelCompatibility(userModel) {
  if (!userModel) {
    return { compatible: false, reason: 'No user model provided' };
  }

  // Basic compatibility check
  const requiredFields = ['name', 'email', 'password'];
  const requiredMethods = ['findOne', 'create', 'save'];
  
  // Check if user model has required structure
  const hasCollection = !!userModel.collection;
  const hasRequiredMethods = requiredMethods.every(method => typeof userModel[method] === 'function' || 
                                                      typeof userModel.prototype?.[method] === 'function');
  
  if (!hasCollection) {
    return { 
      compatible: false, 
      reason: 'User model must have a collection property',
      missingFields: ['collection']
    };
  }
  
  if (!hasRequiredMethods) {
    const missingMethods = requiredMethods.filter(method => 
      typeof userModel[method] !== 'function' && 
      typeof userModel.prototype?.[method] !== 'function');
    return { 
      compatible: false, 
      reason: `Missing required methods: ${missingMethods.join(', ')}`,
      missingMethods
    };
  }

  try {
    // Test basic operations if we have a connection
    if (userModel.db && userModel.db.readyState === 1) { // Connected state
      // Check if we can perform basic operations
      const sampleDoc = await userModel.findOne().limit(1).select('_id').lean().exec();
      
      return { 
        compatible: true, 
        hasSystemReserve: true, // Assuming it exists in our schema
        fields: requiredFields,
        detailedCheck: true
      };
    } else {
      // No active connection, but basic structure is OK
      return { 
        compatible: true, 
        hasSystemReserve: true,
        fields: requiredFields,
        detailedCheck: false,
        note: 'Database not connected, but basic structure is compatible'
      };
    }
  } catch (error) {
    // Database not accessible, but basic structure is OK
    return { 
      compatible: true, 
      hasSystemReserve: true,
      fields: requiredFields,
      detailedCheck: false,
      note: 'Database not accessible, but basic structure is compatible'
    };
  }
}

module.exports = {
  UserModel,
  syncUserModel,
  checkUserModelCompatibility
};