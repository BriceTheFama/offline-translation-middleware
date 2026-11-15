import http from 'node:http';

/**
 * Node 19 turned keep-alive on for `http.globalAgent`, which supertest ends up
 * using. Every test here binds a throwaway server on an ephemeral port, so a
 * pooled socket can outlive the server it was opened against and carry a later
 * request to a dead or recycled port — a stray 400, an empty body, or a
 * response the client cannot parse at all.
 *
 * The agent is mutated rather than replaced: `_http_client` captured the
 * original object by reference, so assigning `http.globalAgent` would have no
 * effect. `keepAlive` and `options` are real at runtime but absent from
 * `@types/node`'s `Agent`, hence the local shape.
 */
const agent = http.globalAgent as http.Agent & {
  keepAlive: boolean;
  options: { keepAlive?: boolean };
};

agent.keepAlive = false;
agent.options.keepAlive = false;
agent.destroy();
