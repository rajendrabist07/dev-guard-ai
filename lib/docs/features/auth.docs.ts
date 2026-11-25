import { jsonResponse } from '../helpers';

export const authSchemas = {
  AuthenticatedUser: {
    type: 'object',
    required: ['id', 'githubAccountId', 'githubLogin'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: { type: ['string', 'null'], format: 'email' },
      githubAccountId: { type: 'string' },
      githubLogin: { type: 'string' },
      avatarUrl: { type: ['string', 'null'], format: 'uri' },
    },
  },
  AuthMeResponse: {
    type: 'object',
    required: ['isAuthenticated'],
    properties: {
      isAuthenticated: { type: 'boolean' },
      user: { $ref: '#/components/schemas/AuthenticatedUser' },
    },
  },
};

export const authPaths = {
  '/api/auth/me': {
    get: {
      tags: ['Authentication'],
      summary: 'Get current authenticated user session',
      description:
        'Verifies the Supabase Auth JWT session cookie and resolves the authoritative GitHub account identity. Never trusts client-supplied identity headers.',
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
      responses: {
        '200': jsonResponse(
          'Authenticated user profile',
          { $ref: '#/components/schemas/AuthMeResponse' },
          {
            isAuthenticated: true,
            user: {
              id: '8f14e45f-ea12-4c9a-9f1b-0c5a6d3e7b11',
              email: 'security-lead@acme-corp.io',
              githubAccountId: '4829104',
              githubLogin: 'acme-sec-lead',
              avatarUrl: 'https://avatars.githubusercontent.com/u/4829104?v=4',
            },
          }
        ),
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
  '/api/auth/signout': {
    post: {
      tags: ['Authentication'],
      summary: 'Sign out and clear session cookies',
      description:
        'Revokes the active Supabase Auth session, expires auth cookies (`sb-auth-token`, `supabase-auth-token`), and redirects to `/login`.',
      security: [{ cookieAuth: [] }],
      responses: {
        '307': {
          description: 'Redirect to `/login` after clearing session cookies',
          headers: {
            Location: {
              schema: { type: 'string', example: '/login' },
            },
          },
        },
      },
    },
  },
};
