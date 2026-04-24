import { Page } from '../models/index.js';

async function seedPages() {
  try {
    const pages = [
      {
        title: 'Privacy Policy',
        slug: 'privacy-policy',
        content: '<h1>Privacy Policy</h1><p>This is the default Privacy Policy content. Please update it in the admin panel.</p>',
        meta_title: 'Privacy Policy',
        meta_description: 'Privacy Policy for Wapi',
        status: true,
        sort_order: 1
      },
      {
        title: 'Terms and Conditions',
        slug: 'terms-and-conditions',
        content: '<h1>Terms and Conditions</h1><p>This is the default Terms and Conditions content. Please update it in the admin panel.</p>',
        meta_title: 'Terms and Conditions',
        meta_description: 'Terms and Conditions for Wapi',
        status: true,
        sort_order: 2
      },
      {
        title: 'Refund Policy',
        slug: 'refund-policy',
        content: '<h1>Refund Policy</h1><p>This is the default Refund Policy content. Please update it in the admin panel.</p>',
        meta_title: 'Refund Policy',
        meta_description: 'Refund Policy for Wapi',
        status: true,
        sort_order: 3
      }
    ];

    for (const pageData of pages) {
      await Page.findOneAndUpdate(
        { slug: pageData.slug },
        pageData,
        { upsert: true, returnDocument: 'after' }
      );
    }

    console.log('Pages seeded successfully!');
  } catch (error) {
    console.error('Error seeding pages:', error);
    throw error;
  }
}

export default seedPages;
