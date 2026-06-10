// Set COOKIE_DOMAIN to 127.0.0.1 so supertest agent cookie jar matches requests
// (supertest connects via 127.0.0.1, but the .env file sets domain to localhost)
process.env['COOKIE_DOMAIN'] = '127.0.0.1';
