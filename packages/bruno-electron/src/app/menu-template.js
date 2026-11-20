const { ipcMain } = require('electron');
const os = require('os');
const { BrowserWindow } = require('electron');
const { version } = require('../../package.json');
const aboutBruno = require('./about-bruno');

const template = [
  {
    label: 'Collection',
    submenu: [
      {
        label: 'Open Collection',
        click() {
          ipcMain.emit('menu:open-collection');
        }
      },
      {
        label: 'Open Recent',
        role: 'recentdocuments',
        visible: os.platform() == 'darwin',
        submenu: [
          {
            label: 'Clear Recent',
            role: 'clearrecentdocuments'
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click() {
          ipcMain.emit('main:start-quit-flow');
        }
      },
      {
        label: 'Force Quit',
        click() {
          process.exit();
        }
      }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'toggledevtools' },
      { type: 'separator' },
      {
        label: 'Actual Size',
        accelerator: 'CommandOrControl+0',
        registerAccelerator: false,
        click() {
          ipcMain.emit('menu:reset-zoom');
        }
      },
      {
        label: 'Zoom In',
        accelerator: 'CommandOrControl+Plus',
        registerAccelerator: false,
        click() {
          ipcMain.emit('menu:zoom-in');
        }
      },
      {
        label: 'Zoom Out',
        accelerator: 'CommandOrControl+-',
        registerAccelerator: false,
        click() {
          ipcMain.emit('menu:zoom-out');
        }
      },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  {
    role: 'window',
    submenu: [{ role: 'minimize' }, { role: 'close', accelerator: 'CommandOrControl+Shift+Q' }]
  },
  {
    role: 'help',
    submenu: [
      {
        label: 'About Bruno',
        click: () => {
          const aboutWindow = new BrowserWindow({
            width: 350,
            height: 250,
            webPreferences: {
              nodeIntegration: false
            }
          });
          aboutWindow.removeMenu();
          aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(aboutBruno({ version }))}`);
        }
      },
      { label: 'Documentation', click: () => ipcMain.emit('main:open-docs') }
    ]
  }
];

module.exports = template;

/* ===== bruno-i18n-zh: menu localization (appended) ===== */
/* 原生菜单中文化：在 module.exports 导出后递归遍历菜单项，
 * 翻译显式 label，并按 role 给原生项补中文 label。
 * 以 BRUNO_I18N_ZH_MENU 标记防止重复生效。 */
(function () {
  if (typeof module === 'undefined' || !module.exports) return;
  if (global.BRUNO_I18N_ZH_MENU) return;
  global.BRUNO_I18N_ZH_MENU = true;

  // 顶层 / 显式 label 翻译
  let labelDict = {
    'Collection': '集合',
    'Open Collection': '打开集合',
    'Open Recent': '最近打开',
    'Clear Recent': '清除最近',
    'Quit': '退出',
    'Force Quit': '强制退出',
    'Edit': '编辑',
    'View': '视图',
    'Window': '窗口',
    'Help': '帮助',
    'Actual Size': '实际大小',
    'Zoom In': '放大',
    'Zoom Out': '缩小',
    'About Bruno': '关于 Bruno',
    'Documentation': '文档',
    'Preferences': '偏好设置',
    'Settings': '设置'
  };

  // 原生 role 项（Electron 默认英文 label）→ 中文
  let roleDict = {
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    pasteAndMatchStyle: '粘贴并匹配样式',
    delete: '删除',
    selectAll: '全选',
    cancel: '取消',
    minimize: '最小化',
    close: '关闭',
    quit: '退出',
    reload: '重新加载',
    forceReload: '强制重新加载',
    toggleDevTools: '切换开发者工具',
    toggledevtools: '切换开发者工具',
    resetZoom: '实际大小',
    zoomIn: '放大',
    zoomOut: '缩小',
    togglefullscreen: '切换全屏',
    toggleFullScreen: '切换全屏',
    hide: '隐藏',
    hideOthers: '隐藏其他',
    unhide: '全部显示',
    front: '前置全部窗口',
    window: '窗口',
    help: '帮助',
    about: '关于',
    services: '服务',
    recentDocuments: '最近打开',
    clearRecentDocuments: '清除最近'
  };

  function walk(items) {
    if (!Array.isArray(items)) return;
    for (let i = 0; i < items.length; i++) {
      let it = items[i];
      if (!it || typeof it !== 'object') continue;
      if (typeof it.label === 'string' && labelDict[it.label]) {
        it.label = labelDict[it.label];
      } else if (it.role && !it.label) {
        let r = roleDict[it.role] || roleDict[String(it.role).toLowerCase()];
        if (r) it.label = r;
      }
      if (it.submenu) walk(it.submenu);
    }
  }

  try { walk(module.exports); } catch (e) { /* never break the menu */ }
})();
