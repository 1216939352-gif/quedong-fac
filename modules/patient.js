/**
 * 患者首诊登记模块
 */
(function () {
  const OPT = (arr) => arr.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('');

  const HISTORY_OPTIONS = [
    ['hypertension', '高血压'], ['diabetes', '糖尿病'], ['dyslipidemia', '高脂血症'],
    ['thyroid', '甲状腺疾病'], ['pcos', '多囊卵巢综合征'], ['cardiovascular', '心血管疾病'],
    ['osteoarthritis', '骨关节疾病'], ['osa', '睡眠呼吸暂停'], ['psych', '心理疾病'],
    ['none', '无（以上均无）']
  ];

  const EXERCISE_TYPES = [
    ['walk', '快走/散步'], ['run', '跑步'], ['swim', '游泳'], ['bike', '骑行'],
    ['gym', '器械力量'], ['yoga', '瑜伽/普拉提'], ['ball', '球类运动'],
    ['dance', '舞蹈/操课'], ['none', '目前无规律运动']
  ];

  /* 患者上下文选择条 */
  function patientBar() {
    const list = AppState.patients;
    const current = list.find(p => p.id === AppState.currentPatientId);
    const codeLabel = current && current.patientCode ? current.patientCode : (AppState.currentPatientId || '新建后自动生成');
    return `
      <div class="card mb-3">
        <div class="card-body" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;">当前操作档案</div>
          <select id="patient-switch" style="flex:1;min-width:220px;">
            <option value="">— 选择患者档案 —</option>
            ${list.map(p => `<option value="${p.id}" ${p.id === AppState.currentPatientId ? 'selected' : ''}>
              ${U.esc(p.patientCode || p.id)} · ${U.esc(p.patientName)}（更新于 ${U.fmtDate(p.updatedAt)}）</option>`).join('')}
          </select>
          ${AppState.currentPatientId ? `<span class="badge badge-success">档案编号：${U.esc(codeLabel)}</span>` : ''}
        </div>
      </div>`;
  }
  window.patientBar = patientBar;

  function bindPatientBar(root) {
    const sel = U.qs('#patient-switch', root);
    if (sel) {
      sel.onchange = async () => {
        if (!sel.value) { clearPatientContext(); AppState.currentPatientId = null; route(); return; }
        await loadPatientContext(sel.value);
        U.toast('已切换患者档案', 'success');
        route();
      };
    }
  }
  window.bindPatientBar = bindPatientBar;

  Pages.patient = function () {
    const p = AppState.patient || {};
    const wrap = U.el(`<div>
      ${patientBar()}

      <div class="alert alert-info">
        <div><strong>首诊登记说明</strong>
        <p style="margin:6px 0 0;font-size:13.5px;line-height:1.75;">
        登记信息是后续能量代谢计算、运动风险判定与个性化处方生成的数据基础。
        带 <span class="required">*</span> 为必填项；工作体力等级将自动联动综合评估页的活动系数推荐值。</p></div>
      </div>

      <form id="patient-form">
        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">👤</span>一、基础信息</h3>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-demo">一键填充演示数据</button></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group"><label>患者姓名 <span class="required">*</span></label>
                <input type="text" name="name" required placeholder="请输入真实姓名"></div>
              <div class="form-group"><label>性别 <span class="required">*</span></label>
                <select name="gender" required><option value="">请选择</option>
                  <option value="male">男</option><option value="female">女</option></select></div>
              <div class="form-group"><label>出生日期 <span class="required">*</span></label>
                <input type="date" name="birthDate" required></div>
              <div class="form-group"><label>年龄（自动计算）</label>
                <input type="text" id="age-display" readonly placeholder="选择出生日期后自动生成"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>联系电话</label><input type="tel" name="phone" placeholder="选填"></div>
              <div class="form-group"><label>职业</label><input type="text" name="occupation" placeholder="如：软件工程师"></div>
              <div class="form-group"><label>工作体力等级</label>
                <select name="workIntensity"><option value="">请选择</option>
                  ${OPT(CONST.WORK_INTENSITY.map(w => [w.key, w.label]))}</select></div>
              <div class="form-group"><label>建档日期</label>
                <input type="date" name="registerDate" value="${U.today()}"></div>
            </div>
            <div class="form-row region-row">
              <div class="form-group"><label>所在地区（省 / 市 / 县区） <span class="required">*</span></label>
                <div style="display:flex;gap:8px;">
                  <select name="regionProvince" id="region-province" required style="flex:1;"><option value="">— 省/直辖市 —</option></select>
                  <select name="regionCity" id="region-city" required disabled style="flex:1;"><option value="">— 市/区 —</option></select>
                  <select name="regionCounty" id="region-county" required disabled style="flex:1;"><option value="">— 县/区 —</option></select>
                </div>
                <small style="color:var(--text-muted);font-size:11.5px;display:block;margin-top:4px;">📊 用于三大方向数据看板的地区分布统计</small>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>身高 cm</label>
                <input type="number" name="height" step="0.1" min="0" id="height-input" placeholder="如 176.0"></div>
              <div class="form-group"><label>体重 kg</label>
                <input type="number" name="weight" step="0.1" min="0" id="weight-input" placeholder="如 96.5"></div>
              <div class="form-group"><label>BMI 体质指数（自动计算）</label>
                <input type="text" id="bmi-display" readonly placeholder="填写身高体重后自动生成"></div>
            </div>
          </div>
        </div>

        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🎯</span>二、减重目标信息</h3></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group full-width"><label>减重主要原因</label>
                <select name="weightLossReason"><option value="">请选择</option>
                  ${OPT([['health', '健康需求（医生建议/指标异常）'], ['appearance', '形体外观改善'],
                    ['disease', '疾病管理（糖尿病/高血压/脂肪肝等）'], ['fertility', '备孕/生育需求'],
                    ['surgery', '术前减重要求'], ['other', '其他']])}</select></div>
              <div class="form-group"><label>过往减重经历</label>
                <select name="pastAttempts"><option value="">请选择</option>
                  ${OPT([['none', '从未尝试'], ['1-2', '尝试 1-2 次'], ['3-5', '尝试 3-5 次'], ['gt5', '尝试 5 次以上']])}</select></div>
              <div class="form-group"><label>是否出现体重反弹</label>
                <select name="rebound"><option value="">请选择</option>
                  ${OPT([['no', '无反弹'], ['slight', '轻度反弹（<5kg）'], ['obvious', '明显反弹（5-10kg）'], ['severe', '严重反弹（>10kg）']])}</select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>目标体重（kg）</label>
                <input type="number" name="targetWeight" step="0.1" placeholder="如 65.0"></div>
              <div class="form-group"><label>期望减重周期</label>
                <select name="targetPeriod"><option value="">请选择</option>
                  ${OPT([['3', '3 个月'], ['6', '6 个月'], ['12', '12 个月'], ['0', '不限时间，稳步进行']])}</select></div>
              <div class="form-group full-width"><label>其他诉求备注</label>
                <input type="text" name="goalNote" placeholder="如：希望改善膝关节疼痛、提升体能"></div>
            </div>
          </div>
        </div>

        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🏥</span>三、病史与用药信息</h3></div>
          <div class="card-body">
            <div class="form-group full-width mb-2"><label>既往病史（可多选，无病史请勾选「无」）</label>
              <div class="checkbox-group">
                ${HISTORY_OPTIONS.map(([v, t]) => `<label class="checkbox-item">
                  <input type="checkbox" name="medicalHistory" value="${v}"><span>${t}</span></label>`).join('')}
              </div>
            </div>
            <div class="form-row">
              <div class="form-group full-width"><label>药物 / 食物过敏史</label>
                <textarea name="allergy" rows="2" placeholder="如：青霉素过敏、海鲜过敏；无请填「无」"></textarea></div>
              <div class="form-group full-width"><label>当前长期服药记录</label>
                <textarea name="medication" rows="2" placeholder="药名 + 剂量 + 频次，如：二甲双胍 0.5g 每日两次"></textarea></div>
            </div>
          </div>
        </div>

        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">💧</span>四、生活基线数据</h3></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group"><label>日均饮水量</label>
                <select name="waterIntake"><option value="">请选择</option>
                  ${OPT([['lt1000', '<1000 ml'], ['1000-1500', '1000-1500 ml'],
                    ['1500-2000', '1500-2000 ml'], ['gt2000', '>2000 ml']])}</select></div>
              <div class="form-group"><label>含糖饮料摄入频率</label>
                <select name="sugarDrink"><option value="">请选择</option>
                  ${OPT([['never', '从不'], ['weekly1', '每周 1-2 次'],
                    ['weekly3', '每周 3-5 次'], ['daily', '每天 ≥1 杯']])}</select></div>
              <div class="form-group"><label>每日睡眠时长</label>
                <select name="sleepDuration"><option value="">请选择</option>
                  ${OPT([['lt6', '<6 小时'], ['6-7', '6-7 小时'], ['7-8', '7-8 小时'], ['gt8', '>8 小时']])}</select></div>
              <div class="form-group"><label>睡眠质量</label>
                <select name="sleepQuality"><option value="">请选择</option>
                  ${OPT([['good', '良好'], ['fair', '一般'], ['poor', '较差'], ['insomnia', '失眠/需服药']])}</select></div>
              <div class="form-group"><label>日常压力等级</label>
                <select name="stressLevel"><option value="">请选择</option>
                  ${OPT([['low', '低（轻松）'], ['medium', '中（可控）'], ['high', '高（经常焦虑）'], ['extreme', '极高（影响生活）']])}</select></div>
            </div>
          </div>
        </div>

        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🏃</span>五、运动基线数据</h3></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group"><label>现有运动频率</label>
                <select name="exerciseFreq"><option value="">请选择</option>
                  ${OPT([['none', '基本不运动'], ['weekly1', '每周 1-2 次'],
                    ['weekly3', '每周 3-4 次'], ['weekly5', '每周 5 次以上']])}</select></div>
              <div class="form-group"><label>单次运动时长</label>
                <select name="exerciseDuration"><option value="">请选择</option>
                  ${OPT([['lt20', '<20 分钟'], ['20-40', '20-40 分钟'],
                    ['40-60', '40-60 分钟'], ['gt60', '>60 分钟']])}</select></div>
              <div class="form-group"><label>膝 / 腰不适情况 <span class="required">*</span></label>
                <select name="jointIssue" required><option value="">请选择</option>
                  ${OPT([['none', '无不适'], ['knee', '膝关节不适'], ['back', '腰部不适'],
                    ['both', '膝与腰均有不适'], ['other', '其他关节不适']])}</select></div>
              <div class="form-group"><label>运动意愿强弱</label>
                <select name="exerciseWillingness"><option value="">请选择</option>
                  ${OPT([['strong', '强烈（愿意主动安排）'], ['medium', '一般（需要督促）'], ['weak', '较弱（较为抵触）']])}</select></div>
            </div>
            <div class="form-group full-width mt-2"><label>运动类型（可多选）</label>
              <div class="checkbox-group">
                ${EXERCISE_TYPES.map(([v, t]) => `<label class="checkbox-item">
                  <input type="checkbox" name="exerciseTypes" value="${v}"><span>${t}</span></label>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🍱</span>六、饮食基线数据</h3></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group"><label>每日进餐次数</label>
                <select name="mealCount"><option value="">请选择</option>
                  ${OPT([['1', '1 餐'], ['2', '2 餐'], ['3', '3 餐'], ['4', '3 餐 + 加餐'], ['5', '5 餐以上/少食多餐']])}</select></div>
              <div class="form-group"><label>是否吃早餐</label>
                <select name="breakfast"><option value="">请选择</option>
                  ${OPT([['always', '每天都吃'], ['often', '经常吃（每周≥4 天）'],
                    ['sometimes', '偶尔吃'], ['never', '基本不吃']])}</select></div>
              <div class="form-group"><label>主食类型</label>
                <select name="stapleType"><option value="">请选择</option>
                  ${OPT([['refined', '以白米白面为主'], ['mixed', '粗细搭配'],
                    ['whole', '以全谷杂粮为主'], ['lowcarb', '刻意低碳/不吃主食']])}</select></div>
              <div class="form-group"><label>蔬菜日均摄入量</label>
                <select name="vegetableIntake"><option value="">请选择</option>
                  ${OPT([['lt150', '<150g'], ['150-300', '150-300g'],
                    ['300-500', '300-500g'], ['gt500', '>500g']])}</select></div>
              <div class="form-group"><label>主要烹饪方式</label>
                <select name="cookingMethod"><option value="">请选择</option>
                  ${OPT([['steam', '蒸煮炖为主'], ['stirfry', '炒菜为主'],
                    ['fry', '煎炸较多'], ['mixed', '多种混合']])}</select></div>
              <div class="form-group"><label>外卖 / 外食频率</label>
                <select name="takeoutFreq"><option value="">请选择</option>
                  ${OPT([['never', '基本不外食'], ['weekly1', '每周 1-2 次'],
                    ['weekly3', '每周 3-5 次'], ['daily', '几乎每餐']])}</select></div>
            </div>
          </div>
        </div>

        <div class="card mt-3 no-print">
          <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;" id="patient-actions">
            <button type="submit" class="btn btn-primary btn-lg">保存登记信息</button>
            <button type="button" class="btn btn-success btn-lg" id="btn-save-next">保存并进入评估 →</button>
            <button type="button" class="btn btn-secondary" id="btn-reset">清空表单</button>
          </div>
        </div>
      </form>
    </div>`);

    const form = U.qs('#patient-form', wrap);

    // 草稿自动保存（输入即落盘，刷新/误关后可续填）
    const patientDraft = SmartForm.bindDraft(form, 'patient-form', { indicatorHost: '#patient-actions' });

    // 年龄自动计算
    const birthInput = U.qs('[name="birthDate"]', form);
    const ageDisplay = U.qs('#age-display', form);
    const syncAge = () => {
      const age = U.calcAge(birthInput.value);
      ageDisplay.value = age !== null ? `${age} 岁` : '';
    };
    birthInput.addEventListener('change', syncAge);

    // BMI 自动计算
    const heightInput = U.qs('#height-input', form);
    const weightInput = U.qs('#weight-input', form);
    const bmiDisplay = U.qs('#bmi-display', form);
    const syncBMI = () => {
      const h = U.num(heightInput.value), w = U.num(weightInput.value);
      bmiDisplay.value = (h > 0 && w > 0) ? U.round(w / Math.pow(h / 100, 2), 1) : '';
    };
    heightInput.addEventListener('input', syncBMI);
    weightInput.addEventListener('input', syncBMI);

    U.bindChoiceStyle(form);
    U.bindNoneExclusive(form, 'medicalHistory', 'none');
    U.bindNoneExclusive(form, 'exerciseTypes', 'none');

    /* —— 所在地区三级联动（基于 assets/data/regions.js） —— */
    const REG = (window.CHINA_REGIONS) || {};
    const pvSel = U.qs('#region-province', form);
    const ctSel = U.qs('#region-city', form);
    const cySel = U.qs('#region-county', form);
    function setOptions(sel, items, placeholder) {
      sel.innerHTML = '<option value="">' + U.esc(placeholder) + '</option>' +
        items.map(s => '<option value="' + U.esc(s) + '">' + U.esc(s) + '</option>').join('');
    }
    setOptions(pvSel, Object.keys(REG), '— 省/直辖市 —');
    if (!REG || !Object.keys(REG).length) {
      pvSel.innerHTML = '<option value="">地区数据未加载，请刷新页面</option>';
      console.warn('[patient] window.CHINA_REGIONS 为空，所在地区三级联动不可用');
    }
    function syncRegionFromData(regionObj) {
      if (!regionObj || !regionObj.province) { pvSel.value = ''; ctSel.value = ''; cySel.value = ''; ctSel.disabled = true; cySel.disabled = true; return; }
      pvSel.value = regionObj.province || '';
      const cities = (REG[pvSel.value] || []).map(c => c.city);
      setOptions(ctSel, cities, '— 市/区 —');
      ctSel.disabled = !cities.length;
      ctSel.value = regionObj.city || '';
      const dists = ((REG[pvSel.value] || []).find(c => c.city === ctSel.value) || {}).districts || [];
      setOptions(cySel, dists, '— 县/区 —');
      cySel.disabled = !dists.length;
      cySel.value = regionObj.county || '';
    }
    pvSel.addEventListener('change', () => syncRegionFromData({ province: pvSel.value }));
    ctSel.addEventListener('change', () => {
      const dists = ((REG[pvSel.value] || []).find(c => c.city === ctSel.value) || {}).districts || [];
      setOptions(cySel, dists, '— 县/区 —');
      cySel.disabled = !dists.length;
    });

    // 回填已有数据
    if (Object.keys(p).length) { U.fillForm(form, p); syncAge(); syncBMI(); }
    if (p.region && typeof p.region === 'object') syncRegionFromData(p.region);

    // 演示数据
    U.qs('#btn-demo', wrap).onclick = () => {
      U.fillForm(form, {
        name: '张伟民', gender: 'male', birthDate: '1985-06-18', phone: '13812345678',
        occupation: '软件研发工程师', workIntensity: 'sedentary', registerDate: U.today(),
        height: '176', weight: '96.5',
        regionProvince: '北京市', regionCity: '北京市', regionCounty: '海淀区',
        weightLossReason: 'health', pastAttempts: '3-5', rebound: 'obvious',
        targetWeight: '78', targetPeriod: '6', goalNote: '希望改善脂肪肝与膝关节负担，提升体能',
        medicalHistory: ['hypertension', 'dyslipidemia', 'osa'],
        allergy: '无', medication: '苯磺酸氨氯地平 5mg 每日一次',
        waterIntake: '1000-1500', sugarDrink: 'weekly3', sleepDuration: '6-7',
        sleepQuality: 'fair', stressLevel: 'high',
        exerciseFreq: 'weekly1', exerciseDuration: 'lt20', jointIssue: 'knee',
        exerciseWillingness: 'medium', exerciseTypes: ['walk'],
        mealCount: '3', breakfast: 'sometimes', stapleType: 'refined',
        vegetableIntake: '150-300', cookingMethod: 'stirfry', takeoutFreq: 'weekly3'
      });
      syncRegionFromData({ province: '北京市', city: '北京市', county: '海淀区' });
      U.bindChoiceStyle(form);
      syncAge();
      syncBMI();
      U.toast('已填充演示测试数据', 'success');
    };

    U.qs('#btn-reset', wrap).onclick = () => U.confirm(
      '将清空当前表单全部已填写内容，此操作不可撤销。', () => {
        form.reset(); U.bindChoiceStyle(form); ageDisplay.value = '';
        U.toast('表单已清空', 'info');
      }, { title: '清空表单', heading: '确认清空所有已填写内容？', okText: '清空' });

    async function save(goNext, btn) {
      const d = U.formData(form);
      if (!d.name || !d.gender || !d.birthDate) return U.toast('请完整填写姓名、性别、出生日期', 'warning');
      if (!d.jointIssue) return U.toast('请选择膝/腰不适情况（影响运动方案安全性）', 'warning');
      if (!d.regionProvince || !d.regionCity || !d.regionCounty) return U.toast('请完整选择所在地区（省 / 市 / 县区）', 'warning');
      await U.withBtn(btn || U.qs('button[type=submit]', form), '保存中…', async () => {
        d.age = U.calcAge(d.birthDate);
        d.bmi = U.num(bmiDisplay.value) || null;
        d.region = { province: d.regionProvince, city: d.regionCity, county: d.regionCounty };
        AppState.patient = d;
        try {
          await persistPatient();
          patientDraft.clear();
          U.toast('登记信息已保存至云端档案', 'success');
          location.hash = '#/assessment';   // 首诊登记保存后进入体重管理评估（默认主入口，后续可在评估页自由切换方向）
        } catch (err) { U.toast('保存失败：' + U.errMsg(err), 'error'); }
      });
    }

    form.onsubmit = e => { e.preventDefault(); save(false); };
    U.qs('#btn-save-next', wrap).onclick = (e) => save(true, e.currentTarget);

    bindPatientBar(wrap);
    return wrap;
  };
})();
