import {checkAdmin, authError} from './lib/auth.js';
export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;
  if (pathname === '/gestion' || pathname.startsWith('/gestion/') || pathname === '/api/admin') {
    try {
      context.data.laureAdmin = await checkAdmin(context.request, context.env);
    } catch(error) {return authError(error);}
  }
  const response = await context.next();
  if (pathname.startsWith('/gestion') || pathname === '/api/admin') {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control','no-store, private');
    headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
    headers.set('X-Content-Type-Options','nosniff');
    return new Response(response.body, {status:response.status, statusText:response.statusText, headers});
  }
  return response;
}
