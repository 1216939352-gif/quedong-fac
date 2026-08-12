/**
 * 前端分级日志工具（L4-16）
 * 暴露全局 window.QDLogger，级别 debug/info/warn/error。
 * 通过以下任一方式设置门槛（默认 info）：
 *   - window.QD_LOG_LEVEL = 'debug'
 *   - localStorage.setItem('QD_LOG_LEVEL', 'debug')
 * 仅在门槛之内才输出，避免生产环境噪音；底层仍走 console，不丢失可追溯性。
 */
(function () {
  'use strict';
  var LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

  function level() {
    var v = (window.QD_LOG_LEVEL ||
      (window.localStorage && localStorage.getItem('QD_LOG_LEVEL')) ||
      'info').toLowerCase();
    return LEVELS[v] !== undefined ? LEVELS[v] : LEVELS.info;
  }

  function write(lv, args) {
    if (LEVELS[lv] < level()) return;
    var prefix = '[QD:' + lv.toUpperCase() + ']';
    if (lv === 'error') console.error(prefix, ...args);
    else if (lv === 'warn') console.warn(prefix, ...args);
    else console.log(prefix, ...args);
  }

  function toArr(a) { return Array.prototype.slice.call(a); }

  window.QDLogger = {
    debug: function () { write('debug', toArr(arguments)); },
    info: function () { write('info', toArr(arguments)); },
    warn: function () { write('warn', toArr(arguments)); },
    error: function () { write('error', toArr(arguments)); },
    setLevel: function (l) { window.QD_LOG_LEVEL = l; },
  };
})();
