const API = 'https://aureonbase.vercel.app';
const PROJECT = 'wilpay';
const ACCESS = 'wilpay_aureon_access';
const REFRESH = 'wilpay_aureon_refresh';

let accessToken = localStorage.getItem(ACCESS) || '';
let refreshToken = localStorage.getItem(REFRESH) || '';
let currentUser = null;

function persist(data = {}) {
  if (data.access_token) {
    accessToken = data.access_token;
    localStorage.setItem(ACCESS, accessToken);
  }
  if (data.refresh_token) {
    refreshToken = data.refresh_token;
    localStorage.setItem(REFRESH, refreshToken);
  }
}

function clear() {
  accessToken = '';
  refreshToken = '';
  currentUser = null;
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

async function raw(path, options = {}, token = accessToken) {
  return fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

async function request(path, options = {}, retry = true) {
  let response = await raw(path, options);
  if (response.status === 401 && retry && refreshToken && path !== '/auth/refresh') {
    const refreshed = await raw(
      '/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
      '',
    );
    if (refreshed.ok) {
      persist(await refreshed.json());
      response = await raw(path, options);
    } else {
      clear();
    }
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data.error;
    error.details = data;
    throw error;
  }
  return data;
}

async function sessionUser() {
  if (!accessToken && !refreshToken) return null;
  try {
    const me = await request('/me');
    currentUser = {
      id: me.id,
      email: me.email,
      name: me.name || me.email,
      is_superadmin: Boolean(me.is_superadmin),
    };
    return currentUser;
  } catch {
    clear();
    return null;
  }
}

const tableToCollection = table => String(table).replace(/^wilpay_/, '');

function flatten(record) {
  const data = record?.data || {};
  return {
    ...data,
    id: data.id ?? record.id,
    created_at: data.created_at || record.created_at,
    updated_at: data.updated_at || record.updated_at,
    _record_id: record.id,
    _owner_user_id: record.owner_user_id,
  };
}

function clean(object) {
  const value = { ...object };
  delete value._record_id;
  delete value._owner_user_id;
  return value;
}

class Builder {
  constructor(table, operation = 'select', payload = null) {
    this.collection = tableToCollection(table);
    this.operation = operation;
    this.payload = payload;
    this.filters = [];
    this.sort = null;
    this.take = null;
    this.wantSelect = false;
  }

  select() {
    this.wantSelect = true;
    return this;
  }

  eq(field, value) {
    this.filters.push([field, value]);
    return this;
  }

  order(field, { ascending = true } = {}) {
    this.sort = { field, ascending };
    return this;
  }

  limit(value) {
    this.take = Number(value);
    return this;
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  matches(row) {
    return this.filters.every(([key, value]) => String(row?.[key] ?? '') === String(value ?? ''));
  }

  shape(records) {
    let rows = records.map(flatten).filter(row => this.matches(row));
    if (this.sort) {
      const { field, ascending } = this.sort;
      rows.sort((a, b) => {
        const av = a?.[field];
        const bv = b?.[field];
        const an = Date.parse(av);
        const bn = Date.parse(bv);
        const comparison = Number.isNaN(an) || Number.isNaN(bn)
          ? String(av ?? '').localeCompare(String(bv ?? ''))
          : an - bn;
        return ascending ? comparison : -comparison;
      });
    }
    if (Number.isFinite(this.take)) rows = rows.slice(0, this.take);
    return rows;
  }

  async list() {
    const records = await request(
      `/v1/projects/${PROJECT}/data/${encodeURIComponent(this.collection)}?limit=500`,
    );
    return this.shape(records);
  }

  async execute() {
    try {
      if (this.operation === 'select') {
        return { data: await this.list(), error: null };
      }

      if (this.operation === 'insert') {
        const inputs = Array.isArray(this.payload) ? this.payload : [this.payload];
        const saved = [];
        for (const item of inputs) {
          const normalized = this.collection === 'loans' && Number(item?.principal || 0) > 1000
            ? { ...item, collateral_required: true }
            : item;
          const body = { data: clean(normalized) };
          if (normalized?.auth_uid) body.owner_user_id = normalized.auth_uid;
          const record = await request(
            `/v1/projects/${PROJECT}/data/${encodeURIComponent(this.collection)}`,
            { method: 'POST', body: JSON.stringify(body) },
          );
          saved.push(flatten(record));
        }
        return { data: this.wantSelect ? saved : null, error: null };
      }

      if (this.operation === 'update') {
        const existing = await this.list();
        const saved = [];
        for (const row of existing) {
          const merged = clean({ ...row, ...this.payload });
          const securedCredit = this.collection === 'loans' && (merged.collateral_required || Number(merged.principal || 0) > 1000);
          if (securedCredit && merged.status === 'ATIVO' && !merged.collateral_received_at) {
            throw new Error('Garantia física ainda não foi confirmada como recebida pelo administrador.');
          }
          const record = await request(
            `/v1/projects/${PROJECT}/data/${encodeURIComponent(this.collection)}/${encodeURIComponent(row._record_id)}`,
            { method: 'PUT', body: JSON.stringify({ data: merged }) },
          );
          saved.push(flatten(record));
        }
        return { data: this.wantSelect ? saved : null, error: null };
      }

      if (this.operation === 'delete') {
        const existing = await this.list();
        for (const row of existing) {
          await request(
            `/v1/projects/${PROJECT}/data/${encodeURIComponent(this.collection)}/${encodeURIComponent(row._record_id)}`,
            { method: 'DELETE' },
          );
        }
        return { data: null, error: null };
      }

      return { data: null, error: { message: 'Operação inválida' } };
    } catch (error) {
      return {
        data: null,
        error: { message: error.message, code: error.code, status: error.status },
      };
    }
  }
}

export const neon = {
  auth: {
    getSession: async () => ({ data: { user: await sessionUser() }, error: null }),

    signUp: {
      email: async ({ name, email, password }) => {
        try {
          const data = await request(
            '/auth/register',
            {
              method: 'POST',
              body: JSON.stringify({
                email: String(email).trim().toLowerCase(),
                password,
                project_slug: PROJECT,
              }),
            },
            false,
          );
          persist(data);
          currentUser = {
            id: data.user.id,
            email: data.user.email,
            name: name || data.user.email,
          };
          if (name) {
            const profile = new Builder('wilpay_profiles', 'insert', {
              auth_uid: data.user.id,
              email: data.user.email,
              name,
              score: 300,
              member_since: new Date().toISOString(),
            });
            await profile.execute();
          }
          return { data: { user: currentUser }, error: null };
        } catch (error) {
          return {
            data: null,
            error: {
              message: error.code === 'email_already_exists'
                ? 'Este e-mail já possui conta.'
                : error.message,
            },
          };
        }
      },
    },

    signIn: {
      email: async ({ email, password }) => {
        try {
          const data = await request(
            '/auth/login',
            {
              method: 'POST',
              body: JSON.stringify({
                email: String(email).trim().toLowerCase(),
                password,
              }),
            },
            false,
          );
          persist(data);
          currentUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.email,
            is_superadmin: Boolean(data.user.is_superadmin),
          };
          const access = await request(`/projects/${PROJECT}/access`).catch(() => null);
          if (!access?.project) throw new Error('Usuário sem acesso ao W.I.L Pay.');
          return { data: { user: currentUser }, error: null };
        } catch (error) {
          clear();
          return {
            data: null,
            error: {
              message: error.code === 'invalid_credentials'
                ? 'E-mail ou senha inválidos.'
                : error.message,
            },
          };
        }
      },
    },

    signOut: async () => {
      try {
        if (accessToken) {
          await request(
            '/auth/logout',
            { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
            false,
          );
        }
      } catch {
        // The local session must still be cleared if the network is unavailable.
      } finally {
        clear();
      }
    },
  },

  from(table) {
    return {
      select: () => new Builder(table, 'select'),
      insert: payload => new Builder(table, 'insert', payload),
      update: payload => new Builder(table, 'update', payload),
      delete: () => new Builder(table, 'delete'),
    };
  },
};
