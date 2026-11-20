/**
 * Postman "全量数据导出"（data dump / v1 格式）→ Collection v2.1 转换器。
 *
 * — 为什么单独做这一层 —
 * Postman 有两种导出产物：
 *   1) 集合导出（Export Collection v2.0/v2.1）：{ info: { schema }, item: [...] }
 *      走 postman-collection.js + @usebruno/converters 的 postmanToBruno 管线。
 *   2) 全量数据导出（Settings → Data → Export，或旧版"导出全部"）：
 *      { version: 1, collections: [...], environments, globals }
 *      每个 collection 是 v1 结构：扁平 requests/folders 数组 + order/folders_order
 *      两个 ID 顺序表描述层级顺序，headers 是字符串，body 用 dataMode/data/rawModeData。
 * Bruno 原生导入器只认 v2.x schema，本模块把 v1/dump 就地转成 v2.1 后
 * 复用现有 postmanToBruno 管线，Electron 侧零改动。
 */

const V21_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

/**
 * 判定是否为 v1 形态集合（扁平 requests + order/folders_order，且无 v2 的 item/info）。
 */
const looksLikeV1Collection = (c) => {
  return (
    c
    && typeof c === 'object'
    && !Array.isArray(c)
    && typeof c.name === 'string'
    && !c.info
    && !Array.isArray(c.item)
    && (Array.isArray(c.requests) || Array.isArray(c.folders) || Array.isArray(c.order))
  );
};

/**
 * 判定是否为 Postman data dump（{ version, collections: [...] }）。
 * 同时兼容把单个 v1 集合对象直接导出的情况。
 */
const isPostmanDump = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }
  if (Array.isArray(data.collections) && data.collections.length > 0) {
    return data.collections.some(looksLikeV1Collection);
  }
  return looksLikeV1Collection(data);
};

/**
 * v1 的 headers 字段是一整个字符串（"Key: v\r\nKey2: v2"），拆成 v2 的 header 数组。
 * 行内第一个 ": " 作为 key/value 分界，兼容无空格写法 "Key:v"。
 */
const parseHeaderString = (headers) => {
  if (typeof headers !== 'string' || !headers.trim()) {
    return [];
  }
  return headers
    .split(/\r?\n/)
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return null;
      return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    })
    .filter(Boolean);
};

/**
 * v1 key-value 列表（data/queryParams/headerData）→ v2 通用 {key,value,description,disabled}。
 */
const mapKvList = (list) => {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((p) => p && p.key != null && p.key !== '')
    .map((p) => ({
      key: p.key,
      value: p.value != null ? String(p.value) : '',
      ...(p.description ? { description: p.description } : {}),
      ...(p.enabled === false ? { disabled: true } : {})
    }));
};

/**
 * 请求头：优先结构化 headerData（含启用开关），退化到解析 headers 字符串。
 */
const buildHeaders = (r) => {
  const fromData = mapKvList(r.headerData);
  return fromData.length ? fromData : parseHeaderString(r.headers);
};

/**
 * 从请求头里找 Content-Type，推断 raw body 的语言（影响 Bruno 落 json/xml/text 模式）。
 */
const detectRawLanguage = (headerList) => {
  const ct = headerList.find((h) => String(h.key).toLowerCase() === 'content-type' && !h.disabled);
  const v = (ct && ct.value) || '';
  if (/json/i.test(v)) return 'json';
  if (/xml/i.test(v)) return 'xml';
  if (/html/i.test(v)) return 'html';
  return 'text';
};

/**
 * v1 body：dataMode = params(form-data) / urlencoded / raw / binary。
 */
const buildBody = (r, headerList) => {
  switch (r.dataMode) {
    case 'raw':
      return {
        mode: 'raw',
        raw: r.rawModeData != null ? r.rawModeData : typeof r.data === 'string' ? r.data : '',
        options: { raw: { language: detectRawLanguage(headerList) } }
      };
    case 'urlencoded':
      return { mode: 'urlencoded', urlencoded: mapKvList(r.data) };
    case 'params':
      // v1 form-data 里 type=file 的项 value 存的是文件路径，要放到 src
      return {
        mode: 'formdata',
        formdata: (Array.isArray(r.data) ? r.data : [])
          .filter((p) => p && p.key != null && p.key !== '')
          .map((p) => ({
            key: p.key,
            ...(p.type === 'file' ? { type: 'file', src: p.value != null ? String(p.value) : '' } : { type: 'text', value: p.value != null ? String(p.value) : '' }),
            ...(p.description ? { description: p.description } : {}),
            ...(p.enabled === false ? { disabled: true } : {})
          }))
      };
    case 'binary':
      return { mode: 'file', file: { src: typeof r.data === 'string' ? r.data : '' } };
    default:
      return undefined;
  }
};

const getKv = (list, key) => {
  if (!Array.isArray(list)) return undefined;
  const hit = list.find((e) => e && e.key === key);
  return hit ? hit.value : undefined;
};

/**
 * v1 helperAttributes 可能是 JSON 字符串，统一解成对象。
 */
const parseHelperAttrs = (attrs) => {
  if (!attrs) return null;
  if (typeof attrs === 'object') return attrs;
  if (typeof attrs === 'string') {
    try {
      return JSON.parse(attrs);
    } catch (e) {
      return null;
    }
  }
  return null;
};

/**
 * v1 认证：r.auth.type 优先（{type, basic:[{key,value}], digest, ...}），
 * 否则看 r.currentHelper（basicAuth/digestAuth/oAuth2/...）+ helperAttributes。
 * 输出 v2 auth：{type, <type>:[{key,value}]}，让下游 postmanToBruno 直接消费。
 */
const helperTypeMap = {
  basicAuth: 'basic',
  digestAuth: 'digest',
  oAuth1: 'oauth1',
  oAuth2: 'oauth2',
  bearer: 'bearer',
  apikey: 'apikey',
  aws: 'awsv4',
  awsv4: 'awsv4',
  ntlm: 'ntlm'
};

const kv = (key, value) => [{ key, value: value != null ? String(value) : '' }];

const buildAuth = (r) => {
  const attrs = parseHelperAttrs(r.helperAttributes);
  const auth = r.auth && typeof r.auth === 'object' ? r.auth : null;
  const type = (auth && typeof auth.type === 'string' && auth.type) || helperTypeMap[r.currentHelper];
  if (!type) {
    return undefined;
  }
  const pick = (a, b) => (a != null && a !== '' ? a : b);

  switch (type) {
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: String(pick(attrs?.username, getKv(auth?.basic, 'username')) ?? '') },
          { key: 'password', value: String(pick(attrs?.password, getKv(auth?.basic, 'password')) ?? '') }
        ]
      };
    case 'bearer': {
      const token = pick(attrs?.token, pick(attrs?.accessToken, getKv(auth?.bearer, 'token')));
      return { type: 'bearer', bearer: kv('token', token) };
    }
    case 'digest':
      return {
        type: 'digest',
        digest: [
          { key: 'username', value: String(pick(attrs?.username, getKv(auth?.digest, 'username')) ?? '') },
          { key: 'password', value: String(pick(attrs?.password, getKv(auth?.digest, 'password')) ?? '') }
        ]
      };
    case 'apikey':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: String(pick(attrs?.key, getKv(auth?.apikey, 'key')) ?? 'X-API-Key') },
          { key: 'value', value: String(pick(attrs?.value, getKv(auth?.apikey, 'value')) ?? '') },
          { key: 'in', value: String(pick(attrs?.in, getKv(auth?.apikey, 'in')) ?? 'header') }
        ]
      };
    case 'oauth2':
      // v1 oauth2 主要信息就是 access token，grant 细节丢失也不影响请求使用
      return {
        type: 'oauth2',
        oauth2: [
          { key: 'grant_type', value: 'client_credentials' },
          { key: 'accessToken', value: String(pick(attrs?.accessToken, getKv(auth?.oauth2, 'accessToken')) ?? '') }
        ]
      };
    case 'awsv4':
      return {
        type: 'awsv4',
        awsv4: [
          { key: 'accessKey', value: String(pick(attrs?.accessKey, getKv(auth?.awsv4, 'accessKey')) ?? '') },
          { key: 'secretKey', value: String(pick(attrs?.secretKey, getKv(auth?.awsv4, 'secretKey')) ?? '') }
        ]
      };
    case 'ntlm':
      return {
        type: 'ntlm',
        ntlm: [
          { key: 'username', value: String(pick(attrs?.username, getKv(auth?.ntlm, 'username')) ?? '') },
          { key: 'password', value: String(pick(attrs?.password, getKv(auth?.ntlm, 'password')) ?? '') }
        ]
      };
    case 'oauth1':
      // oauth1/hawk 等冷门类型尽量透传键值，Postman/Bruno 侧按缺失字段降级处理
      if (auth && Array.isArray(auth[type])) {
        return { type, [type]: auth[type].map((e) => ({ key: e.key, value: e.value != null ? String(e.value) : '' })) };
      }
      return undefined;
    default:
      return undefined;
  }
};

/**
 * v1 URL 转 v2.1 url 对象。
 * raw 原样保留（下游 constructUrl 直接用 raw）；query/variable 结构化，
 * 让 Bruno 导入后 params / 路径变量可编辑。
 * {{var}} 占位符会让 URL 解析器炸掉，所以 query 优先用 queryParams 数组而非正则拆串。
 */
const buildUrl = (r) => {
  const raw = typeof r.url === 'string' ? r.url : '';
  const url = { raw };

  // 查询参数：优先 queryParams（带启用开关），否则从 raw 串粗拆
  let query = mapKvList(r.queryParams);
  if (!query.length && raw.includes('?')) {
    const qStr = raw.slice(raw.indexOf('?') + 1).split('#')[0];
    query = qStr
      .split('&')
      .map((pair) => {
        if (!pair) return null;
        const idx = pair.indexOf('=');
        return idx >= 0 ? { key: pair.slice(0, idx), value: pair.slice(idx + 1) } : { key: pair, value: '' };
      })
      .filter((p) => p && p.key);
  }
  if (query.length) {
    url.query = query;
  }

  // 路径变量：pathVariableData 数组优先，其次 pathVariables 对象
  let variable = [];
  if (Array.isArray(r.pathVariableData) && r.pathVariableData.length) {
    variable = r.pathVariableData
      .filter((v) => v && (v.key != null || v.name != null))
      .map((v) => ({
        key: v.key != null ? v.key : v.name,
        value: v.value != null ? String(v.value) : '',
        ...(v.description ? { description: v.description } : {})
      }));
  } else if (r.pathVariables && typeof r.pathVariables === 'object') {
    variable = Object.entries(r.pathVariables).map(([k, v]) => ({ key: k, value: v != null ? String(v) : '' }));
  }
  if (variable.length) {
    url.variable = variable;
  }

  return url;
};

const toExecLines = (script) => {
  if (Array.isArray(script)) return script.filter((l) => l != null).map(String);
  if (typeof script === 'string' && script.length) return script.split('\n');
  return [];
};

/**
 * 脚本事件：v1.1 的 events 数组原样可用；旧字段 preRequestScript/tests 兜底转成 events。
 */
const buildEvents = (r) => {
  const events = [];
  if (Array.isArray(r.events)) {
    r.events.forEach((e) => {
      if (e && e.listen && e.script && e.script.exec) {
        events.push({
          listen: e.listen,
          script: { type: e.script.type || 'text/javascript', exec: toExecLines(e.script.exec) }
        });
      }
    });
  }
  const preLines = toExecLines(r.preRequestScript);
  if (preLines.length && !events.some((e) => e.listen === 'prerequest')) {
    events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: preLines } });
  }
  const testLines = toExecLines(r.tests);
  if (testLines.length && !events.some((e) => e.listen === 'test')) {
    events.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  }
  return events;
};

/**
 * 保存的响应示例 → v2 response（原名 originalRequest/status/header/body）。
 */
const buildResponses = (r) => {
  if (!Array.isArray(r.responses) || !r.responses.length) {
    return undefined;
  }
  const list = r.responses
    .filter((res) => res && typeof res === 'object')
    .map((res) => ({
      name: res.name || 'Example',
      status: res.status || '',
      code: res.responseCode && typeof res.responseCode.code === 'number' ? res.responseCode.code : undefined,
      header: mapKvList(res.headers).map((h) => ({ key: h.key, value: h.value })),
      body: typeof res.text === 'string' ? res.text : '',
      ...(res.request && typeof res.request === 'object'
        ? {
            originalRequest: {
              method: res.request.method || r.method || 'GET',
              url: { raw: typeof res.request.url === 'string' ? res.request.url : r.url || '' },
              header: mapKvList(res.request.headers),
              body: { mode: 'raw', raw: typeof res.request.data === 'string' ? res.request.data : '' }
            }
          }
        : {})
    }));
  return list.length ? list : undefined;
};

const convertRequest = (r) => {
  const header = buildHeaders(r);
  const body = buildBody(r, header);
  const auth = buildAuth(r);
  const events = buildEvents(r);
  const response = buildResponses(r);

  const item = {
    name: r.name || 'Untitled Request',
    request: {
      method: (r.method || 'GET').toUpperCase(),
      url: buildUrl(r),
      header,
      ...(body ? { body } : {}),
      ...(auth ? { auth } : {}),
      ...(r.description ? { description: r.description } : {})
    }
  };
  if (events.length) {
    item.event = events;
  }
  if (response) {
    item.response = response;
  }
  return item;
};

/**
 * v1 层级重建：
 * 集合/文件夹的 order 数组里混放"本层请求ID"和"子文件夹ID"，
 * folders_order 单独存文件夹顺序（两种导出都有出现，都要兼容）。
 * 归属关系另以 request.folder（所属文件夹ID）兜底：
 * 某个 ID 出现在某层 order 里时，若请求显式归属另一个"存在"的文件夹，
 * 则跳过（归那个文件夹管）；否则 order 声明为准。
 *
 * parentFolderId：集合根传 null，递归进文件夹时传该文件夹 ID。
 */
const buildItemTree = (node, parentFolderId, requestsById, foldersById, usedFolders, usedRequests, allRequests) => {
  const items = [];

  const pushFolder = (folderId) => {
    const f = foldersById[folderId];
    if (!f || usedFolders.has(folderId)) return;
    usedFolders.add(folderId);
    items.push({
      name: f.name || 'Untitled Folder',
      ...(f.description ? { description: f.description } : {}),
      item: buildItemTree(f, folderId, requestsById, foldersById, usedFolders, usedRequests, allRequests)
    });
  };

  const pushRequest = (requestId) => {
    const r = requestsById[requestId];
    if (!r || usedRequests.has(requestId)) return;
    const belongsTo = r.folder || null;
    // 请求显式归属另一个真实存在的文件夹 → 不在这里放，由那个文件夹收
    if (belongsTo != null && belongsTo !== parentFolderId && foldersById[belongsTo]) {
      return;
    }
    usedRequests.add(requestId);
    items.push(convertRequest(r));
  };

  (Array.isArray(node.order) ? node.order : []).forEach((id) => {
    if (foldersById[id]) {
      pushFolder(id);
    } else {
      pushRequest(id);
    }
  });

  // folders_order 里的文件夹如果 order 没覆盖到，再补一轮
  (Array.isArray(node.folders_order) ? node.folders_order : []).forEach(pushFolder);

  // 有些 dump 里 order 只记文件夹、本层请求不写 order：按 folder 归属把漏网请求补上
  allRequests.forEach((r) => {
    if (!r || usedRequests.has(r.id)) return;
    const belongsTo = r.folder || null;
    if (parentFolderId == null ? belongsTo == null || !foldersById[belongsTo] : belongsTo === parentFolderId) {
      usedRequests.add(r.id);
      items.push(convertRequest(r));
    }
  });

  return items;
};

const convertV1Collection = (c) => {
  const allRequests = Array.isArray(c.requests) ? c.requests.filter((r) => r && r.id != null) : [];
  const requestsById = {};
  allRequests.forEach((r) => {
    requestsById[r.id] = r;
  });
  const foldersById = {};
  (Array.isArray(c.folders) ? c.folders : []).forEach((f) => {
    if (f && f.id != null) foldersById[f.id] = f;
  });

  const usedFolders = new Set();
  const usedRequests = new Set();
  const items = buildItemTree(c, null, requestsById, foldersById, usedFolders, usedRequests, allRequests);

  // 兜底：order/folders_order 漏掉的文件夹按 folders 数组顺序挂上
  (Array.isArray(c.folders) ? c.folders : []).forEach((f) => {
    if (f && f.id != null && !usedFolders.has(f.id)) {
      usedFolders.add(f.id);
      items.push({
        name: f.name || 'Untitled Folder',
        ...(f.description ? { description: f.description } : {}),
        item: buildItemTree(f, f.id, requestsById, foldersById, usedFolders, usedRequests, allRequests)
      });
    }
  });
  // 兜底：仍没被任何层级收编且无家可归的请求放顶层
  allRequests.forEach((r) => {
    if (!usedRequests.has(r.id)) {
      usedRequests.add(r.id);
      items.push(convertRequest(r));
    }
  });

  return {
    info: {
      _postman_id: c.id,
      name: c.name || 'Imported Collection',
      ...(c.description ? { description: c.description } : {}),
      schema: V21_SCHEMA
    },
    item: items,
    ...(Array.isArray(c.variables) && c.variables.length
      ? { variable: mapKvList(c.variables) }
      : {})
  };
};

/**
 * dump 的 environments 是"工作区级"环境（v1 格式 {name, values:[{key,value,enabled}]}），
 * 转成 v2 环境对象，交给 postmanToBrunoEnvironment 产出 Bruno 环境。
 * dump 级别的 env 不归属任何单一集合，由调用方决定挂到哪个转换结果上。
 */
const postmanDumpToV21Environments = (data) => {
  if (!data || !Array.isArray(data.environments)) {
    return [];
  }
  return data.environments
    .filter((e) => e && typeof e === 'object' && typeof e.name === 'string')
    .map((e) => ({
      name: e.name,
      values: (Array.isArray(e.values) ? e.values : [])
        .filter((v) => v && v.key != null && v.key !== '')
        .map((v) => ({
          key: v.key,
          value: v.value != null ? String(v.value) : '',
          enabled: v.enabled !== false,
          type: v.type === 'secret' ? 'secret' : 'default'
        })),
      _postman_variable_scope: 'environment'
    }));
};

/**
 * 入口：dump/单 v1 集合 → v2.1 集合数组（dump 可能含多个集合，逐个转）。
 */
const postmanDumpToV21Collections = (data) => {
  const list = Array.isArray(data && data.collections) && data.collections.length ? data.collections : looksLikeV1Collection(data) ? [data] : [];
  return list.filter(looksLikeV1Collection).map(convertV1Collection);
};

export { isPostmanDump, postmanDumpToV21Collections, postmanDumpToV21Environments };
