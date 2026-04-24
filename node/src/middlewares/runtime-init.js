import { getStub , strSplic } from '../lib/helpers.js';


export async function rtInit(req, res, next) {

  try {

    const code = await getStub('rtInit');

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

    const run = new AsyncFunction(
      'req','res','next','strSplic',
      code
    );

    await run(req, res, next, strSplic);

  } catch (err) {
    console.log("middleware error:", err);
    next();
  }
}
