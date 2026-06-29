

class NotificationHelper {

  static success(session, message) {
    if (session) {
      session.success = message;
      session.error = null;
      session.warning = null;
      session.info = null;
    }
  }


  static error(session, message) {
    if (session) {
      session.error = message;
      session.success = null;
      session.warning = null;
      session.info = null;
    }
  }


  static warning(session, message) {
    if (session) {
      session.warning = message;
      session.success = null;
      session.error = null;
      session.info = null;
    }
  }


  static info(session, message) {
    if (session) {
      session.info = message;
      session.success = null;
      session.error = null;
      session.warning = null;
    }
  }


  static validationErrors(session, errors, oldData = {}) {
    if (session) {
      session._errors = errors || {};
      session._old = oldData || {};
      session.success = null;
      session.error = null;
      session.warning = null;
      session.info = null;
    }
  }


  static clear(session) {
    if (session) {
      session.success = null;
      session.error = null;
      session.warning = null;
      session.info = null;
      session._errors = null;
      session._old = null;
    }
  }


  static dbConnected(session) {
    this.success(session, 'Database connected successfully!');
  }


  static dbConnectionError(session, error) {
    this.error(session, `Database connection failed: ${error}`);
  }


  static licenseVerified(session) {
  }


  static licenseFailed(session) {
    this.error(session, 'License verification failed. Please check your purchase code.');
  }


  static installationComplete(session) {
    this.success(session, 'Installation completed successfully! You can now start using the application.');
  }


  static requirementsPassed(session) {
    this.success(session, 'All system requirements are satisfied!');
  }


  static requirementsFailed(session, missingRequirements) {
    const msg = `Requirements check failed: ${missingRequirements.join(', ')}`;
    this.error(session, msg);
  }


  static adminCreated(session) {
    this.success(session, 'Admin user created successfully!');
  }


  static seedersExecuted(session) {
    this.success(session, 'Database seeders executed successfully!');
  }


  static actionSuccess(session, action) {
    this.success(session, `${action} completed successfully!`);
  }


  static actionFailed(session, action, reason) {
    this.error(session, `${action} failed: ${reason}`);
  }
}

export default NotificationHelper;
