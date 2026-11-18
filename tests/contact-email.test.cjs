const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const quietConsole = { log() {}, warn() {}, error() {} };
const configuredEnv = {
  RESEND_API_KEY: 're_test_only',
  RESEND_FROM: 'IndiaMET <test@example.com>'
};

function loadModule(relativePath, dependencies, env = configuredEnv) {
  const filename = path.join(__dirname, '..', relativePath);
  const context = {
    module: { exports: {} },
    require(name) {
      if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
      return dependencies[name];
    },
    console: quietConsole,
    process: { env },
    Buffer
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context.module.exports;
}

function loadEmailService(send, env = configuredEnv) {
  return loadModule('src/services/EmailService.js', {
    resend: { Resend: class { constructor() { this.emails = { send }; } } }
  }, env);
}

function loadContactRoute(results, env = configuredEnv) {
  const handlers = new Map();
  const calls = [];
  const statuses = [];
  const submissions = [];
  const router = {
    get(url, handler) { handlers.set('GET ' + url, handler); },
    post(url, handler) { handlers.set('POST ' + url, handler); }
  };
  async function send(kind, ...args) {
    calls.push({ kind, args });
    return results[calls.length - 1] || { success: true, messageId: 'admin-email' };
  }
  const emailService = {
    initialized: Boolean(env.RESEND_API_KEY && env.RESEND_FROM),
    sendEmail: (...args) => send('email', ...args),
    sendEmailWithAttachment: (...args) => send('attachment', ...args)
  };
  loadModule('src/routes/contact.js', {
    express: { Router: () => router },
    '../services/EmailService': emailService,
    '../services/PassService': {
      async issueContactPass() {
        return { pass: { registrationNumber: 'visitor-test', passUrl: 'https://example.com/pass' }, delivery: null };
      }
    },
    '../models': {
      async init() {
        return { ContactSubmission: {
          async sync() {},
          async create(data) {
            submissions.push(data);
            return { async update(update) { statuses.push(update.emailStatus); } };
          }
        } };
      }
    },
    qrcode: { async toBuffer() { return Buffer.from('test-qr'); } }
  }, env);
  return {
    calls, statuses, submissions,
    async request(method, url, body = {}) {
      const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = JSON.parse(JSON.stringify(value)); return this; }
      };
      await handlers.get(method + ' ' + url)({ body }, response);
      return response;
    }
  };
}

for (const method of ['sendEmail', 'sendEmailWithAttachment']) {
  const invoke = (service) => method === 'sendEmail'
    ? service.sendEmail('visitor@example.com', 'Registration', '<p>Thanks</p>')
    : service.sendEmailWithAttachment({
      to: 'visitor@example.com', subject: 'Registration', html: '<img src="cid:visitor-qr">',
      attachment: { filename: 'badge.png', content: Buffer.from('qr'), cid: 'visitor-qr', contentType: 'image/png' }
    });

  test(method + ' succeeds only when Resend returns a message ID', async () => {
    let sent;
    const service = loadEmailService(async (message) => {
      sent = message;
      return { data: { id: 'resend-message' }, error: null };
    });
    const result = await invoke(service);
    assert.equal(result.success, true);
    assert.equal(result.messageId, 'resend-message');
    assert.equal(sent.from, configuredEnv.RESEND_FROM);
    if (method === 'sendEmailWithAttachment') {
      assert.equal(sent.attachments[0].contentId, 'visitor-qr');
      assert.equal(sent.attachments[0].contentType, 'image/png');
    }
  });

  test(method + ' reports Resend error responses instead of success', async () => {
    const result = await invoke(loadEmailService(async () => ({
      data: null, error: { message: 'Sender domain is not verified' }
    })));
    assert.equal(result.success, false);
    assert.equal(result.error, 'Sender domain is not verified');
  });

  test(method + ' rejects a response without a message ID', async () => {
    const result = await invoke(loadEmailService(async () => ({ data: null, error: null })));
    assert.equal(result.success, false);
    assert.match(result.error, /message ID/);
  });

  test(method + ' handles network failures and missing configuration', async () => {
    const network = await invoke(loadEmailService(async () => { throw new Error('Network unavailable'); }));
    assert.equal(network.success, false);
    assert.equal(network.error, 'Network unavailable');
    for (const env of [{}, { RESEND_API_KEY: 're_test_only' }, { RESEND_FROM: 'test@example.com' }]) {
      const unconfigured = await invoke(loadEmailService(async () => {
        assert.fail('Unconfigured services must not send emails');
      }, env));
      assert.equal(unconfigured.success, false);
      assert.equal(unconfigured.error, 'Resend not initialized');
    }
  });
}

test('contact diagnostics report Resend configuration without exposing credentials', async () => {
  for (const env of [configuredEnv, {}]) {
    const route = loadContactRoute([], env);
    const response = await route.request('GET', '/test');
    assert.equal(response.body.provider, 'resend');
    assert.equal(response.body.environment.hasResendKey, Boolean(env.RESEND_API_KEY));
    assert.equal(response.body.environment.hasResendFrom, Boolean(env.RESEND_FROM));
    assert.equal(response.body.environment.emailServiceInitialized, Boolean(env.RESEND_API_KEY && env.RESEND_FROM));
    assert.equal('hasSendGridKey' in response.body.environment, false);
    assert.equal(JSON.stringify(response.body).includes('re_test_only'), false);
  }
});

for (const formType of ['exhibitor-enquiry', 'visitor-registration']) {
  test(formType + ' reports email success and records sent status', async () => {
    const route = loadContactRoute([{ success: true, messageId: 'user-email' }]);
    const response = await route.request('POST', '/', { formType, name: 'Test Visitor', email: 'visitor@example.com' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.emailSent, true);
    assert.deepEqual(route.statuses, ['sent']);
    assert.equal(route.calls[0].kind, formType === 'visitor-registration' ? 'attachment' : 'email');
  });

  test(formType + ' records failed delivery and still notifies the organizer', async () => {
    const route = loadContactRoute([{ success: false, error: 'Provider rejected the email' }]);
    const response = await route.request('POST', '/', { formType, name: 'Test Visitor', email: 'visitor@example.com' });
    assert.equal(response.statusCode, 502);
    assert.equal(response.body.success, false);
    assert.equal(response.body.emailSent, false);
    assert.match(response.body.message, /details were received/);
    assert.deepEqual(route.statuses, ['failed']);
    assert.equal(route.submissions.length, 1);
    assert.equal(route.calls.length, 2);
  });
}

test('organizer notification failure does not fail a successful visitor email', async () => {
  const route = loadContactRoute([
    { success: true, messageId: 'user-email' },
    { success: false, error: 'Organizer email failed' }
  ]);
  const response = await route.request('POST', '/', {
    formType: 'exhibitor-enquiry', email: 'visitor@example.com'
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.emailSent, true);
  assert.deepEqual(route.statuses, ['sent']);
});

test('invalid contact submissions do not send emails', async () => {
  const route = loadContactRoute([]);
  const response = await route.request('POST', '/', { formType: 'exhibitor-enquiry' });
  assert.equal(response.statusCode, 400);
  assert.equal(route.calls.length, 0);
  assert.equal(route.submissions.length, 0);
});
