import { Permission, Role, RolePermission, User } from '../models/index.js';

export const modules = {
    dashboard: {
        actions: { view: 'view.dashboard' },
        roles: { ADMIN: ['view'], USER: ['view'] }
    },
    adminDashboard: {
        actions: { view: 'view.admin_dashboard' },
        roles: { ADMIN: ['view'] }
    },
    contacts: {
        actions: {
            view: 'view.contacts',
            create: 'create.contacts',
            update: 'update.contacts',
            delete: 'delete.contacts',
            import: 'import.contacts',
            export: 'export.contacts',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete', 'import', 'export'],
            USER: ['view', 'create', 'update', 'delete', 'import', 'export'],
        }
    },
    campaigns: {
        actions: {
            view: 'view.campaigns',
            create: 'create.campaigns',
            update: 'update.campaigns',
            delete: 'delete.campaigns',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    campaignStats: {
        actions: { view_stats: 'view.campaign_stats', update: 'update.campaign_stats' },
        roles: { ADMIN: ['view', 'update'], USER: ['view', 'update'] }
    },
    templates: {
        actions: {
            view: 'view.template',
            create: 'create.template',
            update: 'update.template',
            delete: 'delete.template',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    adminTemplates: {
        actions: {
            view: 'view.admin-template',
            create: 'create.admin-template',
            update: 'update.admin-template',
            delete: 'delete.admin-template',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view']
        }
    },
    sequences: {
        actions: {
            view: 'view.sequences',
            create: 'create.sequences',
            update: 'update.sequences',
            delete: 'delete.sequences',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    chatbots: {
        actions: {
            view: 'view.chatbots',
            create: 'create.chatbots',
            update: 'update.chatbots',
            delete: 'delete.chatbots',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    teams: {
        actions: {
            view: 'view.teams',
            create: 'create.teams',
            update: 'update.teams',
            delete: 'delete.teams',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    agents: {
        actions: {
            view: 'view.agents',
            create: 'create.agents',
            update: 'update.agents',
            delete: 'delete.agents',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    agentTasks: {
        actions: {
            view: 'view.agent-task',
            create: 'create.agent-task',
            update: 'update.agent-task',
            delete: 'delete.agent-task',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    conversations: {
        actions: {
            manage: 'manage.conversations'
        },
        roles: {
            ADMIN: ['manage'],
            USER: ['manage'],
        }
    },
    tags: {
        actions: {
            view: 'view.tags',
            create: 'create.tags',
            update: 'update.tags',
            delete: 'delete.tags',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    aiAssistance: {
        actions: {
            create: 'create.ai_prompts',
            view: 'view.languages',
        },
        roles: {
            ADMIN: ['view', 'create'],
            USER: ['view', 'create'],
        }
    },
    apiKeys: {
        actions: {
            view: 'view.api_key',
            create: 'create.api_key',
            delete: 'delete.api_key',
        },
        roles: {
            ADMIN: ['view', 'create', 'delete'],
            USER: ['view', 'create', 'delete'],
        }
    },
    attachments: {
        actions: {
            view: 'view.attachment',
            create: 'create.attachment',
            delete: 'delete.attachment',
        },
        roles: {
            ADMIN: ['view', 'create', 'delete'],
            USER: ['view', 'create', 'delete'],
        }
    },
    automations: {
        actions: {
            view: 'view.automation_flows',
            create: 'create.automation_flows',
            update: 'update.automation_flows',
            delete: 'delete.automation_flows',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    contactInquiries: {
        actions: {
            view: 'view.contact_inquiries',
            create: 'create.contact_inquiries',
            delete: 'delete.contact_inquiries',
        },
        roles: {
            ADMIN: ['view', 'create', 'delete'],
            USER: ['create'],
        }
    },
    currencies: {
        actions: {
            view: 'view.currencies',
            create: 'create.currencies',
            update: 'update.currencies',
            delete: 'delete.currencies',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view'],
        }
    },
    customFields: {
        actions: {
            view: 'view.custom_fields',
            create: 'create.custom_fields',
            update: 'update.custom_fields',
            delete: 'delete.custom_fields',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    catalogs: {
        actions: {
            view: 'view.ecommerce_catalogs',
            update: 'update.ecommerce_catalogs'
        },
        roles: {
            ADMIN: ['view', 'update'],
            USER: ['view', 'update'],
        }
    },
    orders: {
        actions: {
            view: 'view.ecommerce_orders',
            update: 'update.ecommerce_orders',
            delete: 'delete.ecommerce_orders',
        },
        roles: {
            ADMIN: ['view', 'update', 'delete'],
            USER: ['view', 'update', 'delete'],
        }
    },
    webhooks: {
        actions: {
            view: 'view.ecommerce_webhooks',
            create: 'create.ecommerce_webhooks',
            update: 'update.ecommerce_webhooks',
            delete: 'delete.ecommerce_webhooks',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    faqs: {
        actions: {
            view: 'view.faqs',
            create: 'create.faqs',
            update: 'update.faqs',
            delete: 'delete.faqs',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view'],
        }
    },
    importJobs: {
        actions: { view: 'view.import_jobs', delete: 'delete.import_jobs' },
        roles: { ADMIN: ['view', 'delete'], USER: ['view', 'delete'] }
    },
    landingPage: {
        actions: { update: 'update.landing_page', view: 'view.landing_page' },
        roles: { ADMIN: ['update', 'view'] }
    },
    languages: {
        actions: {
            view: 'view.languages',
            create: 'create.languages',
            update: 'update.languages',
            delete: 'delete.languages',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view'],
        }
    },
    messageBots: {
        actions: {
            view: 'view.message_bots',
            create: 'create.message_bots',
            update: 'update.message_bots',
            delete: 'delete.message_bots',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    pages: {
        actions: {
            view: 'view.pages',
            create: 'create.pages',
            update: 'update.pages',
            delete: 'delete.pages',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view'],
        }
    },
    plans: {
        actions: {
            view: 'view.plans',
            create: 'create.plans',
            update: 'update.plans',
            delete: 'delete.plans',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view'],
        }
    },
    products: {
        actions: {
            view: 'view.products',
            create: 'create.products',
            update: 'update.products',
            delete: 'delete.products',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    replyMaterials: {
        actions: {
            view: 'view.reply_materials',
            create: 'create.reply_materials',
            update: 'update.reply_materials',
            delete: 'delete.reply_materials',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    roles: {
        actions: {
            view: 'view.roles',
            create: 'create.roles',
            update: 'update.roles',
            delete: 'delete.roles',
        },
        roles: { ADMIN: ['view', 'create', 'update', 'delete'] }
    },
    settings: {
        actions: { view: 'view.settings', update: 'update.settings' },
        roles: {
            ADMIN: ['view', 'update'],
            USER: ['view'],
        }
    },
    shortLinks: {
        actions: {
            view: 'view.short_links',
            create: 'create.short_links',
            update: 'update.short_links',
            delete: 'delete.short_links',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    subscriptions: {
        actions: {
            view: 'view.subscriptions',
            create: 'create.subscriptions',
            update: 'update.subscriptions',
        },
        roles: {
            ADMIN: ['view', 'create', 'update'],
            USER: ['view', 'create', 'update'],
        }
    },
    testimonials: {
        actions: {
            view: 'view.testimonials',
            create: 'create.testimonials',
            update: 'update.testimonials',
            delete: 'delete.testimonials',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view'],
        }
    },
    unifiedWhatsapp: {
        actions: {
            view: 'view.unified_whatsapp',
            create: 'create.unified_whatsapp',
            update: 'update.unified_whatsapp',
            delete: 'delete.unified_whatsapp',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    users: {
        actions: {
            view: 'view.users',
            create: 'create.users',
            update: 'update.users',
            delete: 'delete.users',
        },
        roles: { ADMIN: ['view', 'create', 'update', 'delete'] }
    },
    userSettings: {
        actions: { view: 'view.user_settings', update: 'update.user_settings' },
        roles: {
            ADMIN: ['view', 'update'],
            USER: ['view', 'update'],
        }
    },
    wabaConfiguration: {
        actions: { view: 'view.waba_configuration', update: 'update.waba_configuration' },
        roles: {
            ADMIN: ['view', 'update'],
            USER: ['view', 'update'],
        }
    },
    widget: {
        actions: {
            view: 'view.widget',
            create: 'create.widget',
            update: 'update.widget',
            delete: 'delete.widget',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    workingHours: {
        actions: {
            view: 'view.working_hours',
            create: 'create.working_hours',
            delete: 'delete.working_hours',
        },
        roles: {
            ADMIN: ['view', 'create', 'delete'],
            USER: ['view', 'create', 'delete'],
        }
    },
    workspace: {
        actions: {
            view: 'view.workspace',
            create: 'create.workspace',
            update: 'update.workspace',
            delete: 'delete.workspace',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    ai_models: {
        actions: {
            view: 'view.ai_models',
            create: 'create.ai_models',
            update: 'update.ai_models',
            delete: 'delete.ai_models',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    taxes: {
        actions: {
            view: 'view.taxes',
            create: 'create.taxes',
            update: 'update.taxes',
            delete: 'delete.taxes',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view']
        }
    },
    whatsapp_calling: {
        actions: {
            view: 'view.whatsapp_calling',
            create: 'create.whatsapp_calling',
            update: 'update.whatsapp_calling',
            delete: 'delete.whatsapp_calling',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    form_builder: {
        actions: {
            view: 'view.form_builder',
            create: 'create.form_builder',
            update: 'update.form_builder',
            delete: 'delete.form_builder',
        },
        roles: {
            ADMIN: ['view', 'create', 'update', 'delete'],
            USER: ['view', 'create', 'update', 'delete'],
        }
    },
    submissions: {
        actions: {
            view: 'view.submissions',
            delete: 'delete.submissions',
        },
        roles: {
            ADMIN: ['view', 'delete'],
            USER: ['view', 'delete'],
        }
    }
};


const seedPermission = async () => {
    try {
        console.log('Seeding permissions...');

        const permissionList = [];

        Object.values(modules).forEach(module => {
            Object.entries(module.actions).forEach(([actionKey, slug]) => {
                const name = slug
                    .split('.')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');

                permissionList.push({
                    name,
                    slug,
                    description: `Permission to ${actionKey} ${slug.split('.')[1] || ''}`
                });
            });
        });

        const ops = permissionList.map(p => ({
            updateOne: {
                filter: { slug: p.slug },
                update: { $set: p },
                upsert: true
            }
        }));

        await Permission.bulkWrite(ops);

        console.log('Permissions seeded successfully!');

        console.log('Assigning permissions to roles...');

        const allPermissions = await Permission.find().lean();
        const permissionMap = {};

        allPermissions.forEach(p => {
            permissionMap[p.slug] = p._id;
        });

        const roleMapping = {
            ADMIN: ['super_admin', 'admin'],
            USER: ['user']
        };

        for (const [key, roleNames] of Object.entries(roleMapping)) {
            for (const roleName of roleNames) {

                const role = await Role.findOne({ name: roleName });
                if (!role) continue;

                const rolePermissionIds = [];

                Object.values(modules).forEach(module => {
                    const actions = module.roles[key] || [];

                    actions.forEach(actionKey => {
                        const slug = module.actions[actionKey];
                        if (slug && permissionMap[slug]) {
                            rolePermissionIds.push(permissionMap[slug]);
                        }
                    });
                });

                if (rolePermissionIds.length > 0) {
                    await RolePermission.deleteMany({ role_id: role._id });

                    const rolePermissionsData = [...new Set(rolePermissionIds.map(id => id.toString()))]
                        .map(id => ({ role_id: role._id, permission_id: id }));

                    await RolePermission.insertMany(rolePermissionsData);

                    console.log(`Assigned ${rolePermissionsData.length} permissions to role: ${roleName}`);
                }
            }
        }

        console.log('Role permissions assignment completed');

        console.log('Checking for users without assigned roles...');

        const usersWithoutRoles = await User.find({
            role_id: null,
            deleted_at: null
        }).lean();

        if (usersWithoutRoles.length > 0) {
            console.log(`Found ${usersWithoutRoles.length} users without roles. Attempting to assign roles...`);

            const allRoles = await Role.find({ deleted_at: null }).lean();
            const roleMap = {};
            allRoles.forEach(role => {
                roleMap[role.name.toLowerCase()] = role._id;
            });



            for (const user of usersWithoutRoles) {
                let assignedRoleId = null;


                if (user.role_key && typeof user.role_key === 'string') {
                    const normalizedRoleKey = user.role_key.toLowerCase();
                    assignedRoleId = roleMap[normalizedRoleKey];

                    if (!assignedRoleId) {
                        console.warn(`No matching role found for role_key "${user.role_key}" for user ${user.email}`);
                    }
                }

                if (!assignedRoleId && user.email) {
                    if (user.email.toLowerCase().includes('admin')) {
                        assignedRoleId = roleMap['super_admin'];
                    } else {
                        assignedRoleId = roleMap['user'];
                    }
                }

                if (!assignedRoleId) {
                    assignedRoleId = roleMap['user'];
                }

                if (assignedRoleId) {
                    await User.findByIdAndUpdate(user._id, {
                        role_id: assignedRoleId
                    });
                    console.log(`✓ Assigned role to user ${user.email}: Role ID ${assignedRoleId}`);
                }
            }

            console.log(`Successfully assigned roles to ${usersWithoutRoles.length} users`);
        } else {
            console.log('All users already have assigned roles');
        }

        console.log('Permission seeding and role assignment completed successfully!');

    } catch (error) {
        console.error('Error seeding permissions:', error);
    }
};

export default seedPermission;
