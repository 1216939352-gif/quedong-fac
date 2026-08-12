/**
 * 语音输入模块（鹊动小Qoo 浮窗问答专用）
 * 封装 Web Speech API（SpeechRecognition / webkitSpeechRecognition）。
 * 注意：浏览器要求安全上下文——localhost 或 HTTPS；非安全上下文下 supported() 返回 false，UI 自动隐藏麦克风按钮。
 */
(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var _rec = null;

  function supported() {
    return !!SR && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.endsWith('.local'));
  }

  function start(opts) {
    opts = opts || {};
    if (!SR) { if (opts.onError) opts.onError('当前浏览器不支持语音输入'); return; }
    if (_rec) { try { _rec.stop(); } catch (e) {} _rec = null; }
    var rec = new SR();
    _rec = rec;
    rec.lang = opts.lang || 'zh-CN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onstart = function () { if (opts.onStart) opts.onStart(); };
    rec.onerror = function (ev) {
      var msg = (ev && (ev.error || ev.message)) || '识别错误';
      if (opts.onError) opts.onError(msg);
    };
    rec.onend = function () {
      _rec = null;
      if (opts.onEnd) opts.onEnd();
    };
    rec.onresult = function (ev) {
      var interim = '', final = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var txt = ev.results[i][0].transcript || '';
        if (ev.results[i].isFinal) final += txt; else interim += txt;
      }
      if (final) { if (opts.onFinal) opts.onFinal(final.trim()); }
      else if (interim && opts.onInterim) { opts.onInterim(interim.trim()); }
    };

    try { rec.start(); }
    catch (e) { if (opts.onError) opts.onError(e && e.message ? e.message : '启动失败'); if (opts.onEnd) opts.onEnd(); }
  }

  function stop() {
    if (_rec) { try { _rec.stop(); } catch (e) {} _rec = null; }
  }

  window.VoiceInput = { supported: supported, start: start, stop: stop };
})();
