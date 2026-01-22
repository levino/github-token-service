import { Router } from 'express';
import { config } from '../config.ts';

export const webRouter = Router();

// Serve simple HTML pages
// In production, you'd use a proper template engine or static files

const loginPage = `
<!DOCTYPE html>
<html>
<head>
  <title>Login - GitHub Token Service</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
    button { padding: 12px 24px; font-size: 16px; cursor: pointer; }
    .error { color: red; margin-top: 10px; }
  </style>
</head>
<body>
  <h1>GitHub Token Service</h1>
  <p>Sign in with your passkey to manage devpod registrations.</p>
  <button id="login">Sign in with Passkey</button>
  <div id="error" class="error"></div>
  <script>
    document.getElementById('login').addEventListener('click', async () => {
      try {
        const optionsRes = await fetch('/api/auth/login/options', { method: 'POST' });
        const options = await optionsRes.json();
        if (options.error) throw new Error(options.error);

        // Convert base64url to ArrayBuffer
        options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        if (options.allowCredentials) {
          options.allowCredentials = options.allowCredentials.map(c => ({
            ...c,
            id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0))
          }));
        }

        const credential = await navigator.credentials.get({ publicKey: options });

        // Convert response to JSON-serializable format
        const response = {
          id: credential.id,
          rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, ''),
          type: credential.type,
          response: {
            authenticatorData: btoa(String.fromCharCode(...new Uint8Array(credential.response.authenticatorData))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, ''),
            clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, ''),
            signature: btoa(String.fromCharCode(...new Uint8Array(credential.response.signature))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, ''),
          },
          clientExtensionResults: credential.getClientExtensionResults(),
        };

        const verifyRes = await fetch('/api/auth/login/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response),
        });

        const result = await verifyRes.json();
        if (result.success) {
          window.location.href = '/dashboard';
        } else {
          throw new Error(result.error || 'Login failed');
        }
      } catch (e) {
        document.getElementById('error').textContent = e.message;
      }
    });
  </script>
</body>
</html>
`;

const dashboardPage = `
<!DOCTYPE html>
<html>
<head>
  <title>Dashboard - GitHub Token Service</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
    th { background: #f5f5f5; }
    .active { color: green; }
    .revoked { color: red; }
    button { padding: 6px 12px; cursor: pointer; }
    nav { margin-bottom: 20px; }
    nav a { margin-right: 15px; }
  </style>
</head>
<body>
  <nav>
    <a href="/dashboard">Dashboard</a>
    <a href="/device">Authorize Device</a>
    <a href="#" id="logout">Logout</a>
  </nav>
  <h1>Registered Devpods</h1>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Repos</th>
        <th>Created</th>
        <th>Last Seen</th>
        <th>Requests</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="registrations"></tbody>
  </table>
  <script>
    async function load() {
      const res = await fetch('/api/registrations');
      if (res.status === 401) { window.location.href = '/'; return; }
      const data = await res.json();
      const tbody = document.getElementById('registrations');
      tbody.innerHTML = data.map(r => \`
        <tr>
          <td>\${r.devpod_name}</td>
          <td>\${r.allowed_repos.join(', ')}</td>
          <td>\${new Date(r.created_at).toLocaleDateString()}</td>
          <td>\${r.last_token_request ? new Date(r.last_token_request).toLocaleString() : 'Never'}</td>
          <td>\${r.token_request_count}</td>
          <td class="\${r.status}">\${r.status}</td>
          <td>\${r.status === 'active' ? \`<button onclick="revoke('\${r.id}')">Revoke</button>\` : ''}</td>
        </tr>
      \`).join('');
    }
    async function revoke(id) {
      if (!confirm('Revoke this registration?')) return;
      await fetch(\`/api/registrations/\${id}\`, { method: 'DELETE' });
      load();
    }
    document.getElementById('logout').addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    });
    load();
  </script>
</body>
</html>
`;

const devicePage = `
<!DOCTYPE html>
<html>
<head>
  <title>Authorize Device - GitHub Token Service</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
    input { padding: 12px; font-size: 18px; width: 200px; text-transform: uppercase; letter-spacing: 2px; }
    button { padding: 12px 24px; font-size: 16px; margin: 5px; cursor: pointer; }
    .pending { background: #fffbe6; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .error { color: red; }
    .approve { background: #52c41a; color: white; border: none; }
    .deny { background: #ff4d4f; color: white; border: none; }
    nav { margin-bottom: 20px; }
    nav a { margin-right: 15px; }
  </style>
</head>
<body>
  <nav>
    <a href="/dashboard">Dashboard</a>
    <a href="/device">Authorize Device</a>
  </nav>
  <h1>Authorize Device</h1>
  <div id="lookup">
    <p>Enter the code shown on your devpod:</p>
    <input type="text" id="code" placeholder="XXXX-XXXX" maxlength="9">
    <button id="submit">Look Up</button>
    <div id="error" class="error"></div>
  </div>
  <div id="pending" class="pending" style="display:none">
    <h3>Authorization Request</h3>
    <p><strong>Devpod:</strong> <span id="devpod_name"></span></p>
    <p><strong>Repositories:</strong> <span id="repos"></span></p>
    <p>Do you want to authorize this devpod?</p>
    <button class="approve" id="approve">Approve</button>
    <button class="deny" id="deny">Deny</button>
  </div>
  <div id="result" style="display:none"></div>
  <script>
    let currentCode = '';
    document.getElementById('code').addEventListener('input', (e) => {
      let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (v.length > 4) v = v.slice(0,4) + '-' + v.slice(4,8);
      e.target.value = v;
    });
    document.getElementById('submit').addEventListener('click', async () => {
      const code = document.getElementById('code').value;
      try {
        const res = await fetch(\`/api/device/pending/\${code}\`);
        if (res.status === 401) { window.location.href = '/'; return; }
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        currentCode = code;
        document.getElementById('devpod_name').textContent = data.devpod_name;
        document.getElementById('repos').textContent = data.requested_repos.join(', ');
        document.getElementById('lookup').style.display = 'none';
        document.getElementById('pending').style.display = 'block';
        document.getElementById('error').textContent = '';
      } catch (e) {
        document.getElementById('error').textContent = e.message;
      }
    });
    async function authorize(action) {
      const res = await fetch('/api/device/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: currentCode, action }),
      });
      const data = await res.json();
      document.getElementById('pending').style.display = 'none';
      document.getElementById('result').style.display = 'block';
      document.getElementById('result').innerHTML = action === 'approve'
        ? '<p style="color:green">Device authorized! The CLI can now request tokens.</p>'
        : '<p style="color:red">Authorization denied.</p>';
    }
    document.getElementById('approve').addEventListener('click', () => authorize('approve'));
    document.getElementById('deny').addEventListener('click', () => authorize('deny'));
  </script>
</body>
</html>
`;

webRouter.get('/', (_req, res) => {
  res.type('html').send(loginPage);
});

webRouter.get('/dashboard', (_req, res) => {
  res.type('html').send(dashboardPage);
});

webRouter.get('/device', (_req, res) => {
  res.type('html').send(devicePage);
});
