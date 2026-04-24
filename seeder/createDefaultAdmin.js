import bcrypt from 'bcryptjs';
import { User, Role } from '../models/index.js';


async function createDefaultAdmin() {

  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.log('ADMIN_EMAIL not set, skipping default admin creation');
    return;
  }

  const existingAdmin = await User.findOne({ email: adminEmail, deleted_at: null });

  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const superAdminRole = await Role.findOne({ name: 'super_admin' });

    await User.create({
      name: process.env.ADMIN_NAME || 'Admin',
      email: adminEmail,
      password: hashedPassword,
      role_id: superAdminRole ? superAdminRole._id : null,
      email_verified: true
    });

    console.log('Default admin created!');
  } else {
    console.log('Default admin already exists.');
  }
}

export default createDefaultAdmin;
