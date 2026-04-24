import { Role } from '../models/index.js';

export const seedDefaultRoles = async () => {
    try {
        console.log('Seeding roles...');

        const rolesData = [
            { name: 'super_admin', system_reserved: true },
            { name: 'agent', system_reserved: true },
            { name: 'user', system_reserved: true }
        ];

        for (const roleData of rolesData) {
            let role = await Role.findOne({ name: roleData.name });

            if (!role) {
                await Role.create(roleData);
                console.log(`Created role: ${roleData.name}`);
            }
        }

        console.log('Role seeding completed');
    } catch (error) {
        console.error('Role seeding error:', error);
    }
};