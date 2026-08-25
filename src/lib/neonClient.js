import {createClient} from '@neondatabase/neon-js';

export const neon=createClient({
  auth:{url:'https://ep-calm-shape-aux4hut6.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth'},
  dataApi:{url:'https://ep-calm-shape-aux4hut6.apirest.c-10.us-east-1.aws.neon.tech/neondb/rest/v1'}
});
