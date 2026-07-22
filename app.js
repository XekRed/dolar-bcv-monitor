/* ============================================
   DÓLAR MONITOR XK — App Logic
   ============================================ */

const API_BCV = 'https://rates.dolarvzla.com/bcv/current.json';
const API_DOLARES = 'https://ve.dolarapi.com/v1/dolares';
const API_HISTORY = 'https://ve.dolarapi.com/v1/historicos/dolares/oficial';
const SALARIO_MINIMO_BS = 130;

let rates = { usdBcv:0, usdBcvPrev:0, eurBcv:0, eurBcvPrev:0, usdt:0, usdChangePct:0, eurChangePct:0 };
let historyData = [];
let compChart = null, gaugeChart = null, histChart = null;

function $(id) {
    const el = document.getElementById(id);
    if (!el) console.warn('Element not found:', id);
    return el;
}

// Safe textContent setter
function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
}

function setStyle(id, prop, val) {
    const el = $(id);
    if (el) el.style[prop] = val;
}

// --- Particles ---
function createParticles() {
    const c = $('particles');
    if (!c) return;
    const cols = ['rgba(0,240,255,0.3)','rgba(0,191,165,0.2)','rgba(88,101,242,0.18)','rgba(0,229,160,0.18)'];
    for (let i = 0; i < 25; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const s = Math.random()*3+1, col = cols[Math.floor(Math.random()*cols.length)];
        p.style.cssText = `width:${s}px;height:${s}px;background:${col};box-shadow:0 0 ${s*3}px ${col};left:${Math.random()*100}%;animation-duration:${Math.random()*15+10}s;animation-delay:${Math.random()*15}s;`;
        c.appendChild(p);
    }
}

// --- Helpers ---
function fmtDate(s) {
    try {
        const d = new Date(s + (s.includes('T') ? '' : 'T12:00:00'));
        return d.toLocaleDateString('es-VE', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    } catch { return s; }
}
function fmtN(n, d=4) { return Number(n).toLocaleString('es-VE', { minimumFractionDigits:d, maximumFractionDigits:d }); }
function animN(id, target, dec=4, dur=1000) {
    const el = $(id);
    if (!el) return;
    const t0 = performance.now();
    (function step(now) {
        const p = Math.min((now-t0)/dur, 1);
        el.textContent = fmtN(target * (1 - Math.pow(1-p, 3)), dec);
        if (p < 1) requestAnimationFrame(step);
    })(t0);
}

// --- UI States ---
function showLoading() {
    const lo = $('loadingOverlay'), ep = $('errorPanel'), dc = $('dataContent');
    if (lo) lo.style.display = 'flex';
    if (ep) ep.style.display = 'none';
    if (dc) dc.style.display = 'none';
}

function showError(msg) {
    const lo = $('loadingOverlay'), ep = $('errorPanel'), dc = $('dataContent');
    if (lo) lo.style.display = 'none';
    if (ep) ep.style.display = 'block';
    if (dc) dc.style.display = 'none';
    setText('errorMessage', msg);
    const b = $('liveBadge');
    if (b) {
        b.classList.remove('live');
        const span = b.querySelector('span:last-child');
        if (span) span.textContent = 'ERROR';
    }
}

function showData() {
    const lo = $('loadingOverlay'), ep = $('errorPanel'), dc = $('dataContent');
    if (lo) lo.style.display = 'none';
    if (ep) ep.style.display = 'none';
    if (dc) dc.style.display = 'block';
    const b = $('liveBadge');
    if (b) {
        b.classList.add('live');
        const span = b.querySelector('span:last-child');
        if (span) span.textContent = 'EN VIVO';
    }
    document.querySelectorAll('.data-content .card').forEach(c => c.classList.add('fade-in-up'));
}

// --- Update Status ---
function checkUpdateStatus(currentDate) {
    const us = $('updateStatus');
    if (!us) return;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;

    if (currentDate === todayStr) {
        us.className = 'update-status updated';
        setText('updateText', '✓ Actualizado hoy');
    } else if (isWeekend) {
        us.className = 'update-status updated';
        setText('updateText', 'Fin de semana');
    } else {
        us.className = 'update-status not-updated';
        setText('updateText', 'Pendiente de hoy');
    }
}

// --- Fetch ---
async function fetchAllData() {
    showLoading();
    try {
        // Fetch BCV data (primary)
        let bcv;
        try {
            const bcvR = await fetch(API_BCV);
            if (!bcvR.ok) throw new Error(`BCV HTTP ${bcvR.status}`);
            bcv = await bcvR.json();
        } catch (e) {
            throw new Error('No se pudo conectar con BCV. Si abriste el archivo directamente, usa la URL de GitHub Pages. (' + e.message + ')');
        }

        // Fetch secondary data (non-critical)
        let dolares = [];
        try {
            const dolR = await fetch(API_DOLARES);
            if (dolR.ok) dolares = await dolR.json();
        } catch (e) { console.warn('DolarAPI dolares failed:', e); }

        try {
            const histR = await fetch(API_HISTORY);
            if (histR.ok) historyData = await histR.json();
        } catch (e) { console.warn('DolarAPI history failed:', e); }

        // Process BCV
        rates.usdBcv = bcv.current.usd;
        rates.usdBcvPrev = bcv.previous.usd;
        rates.eurBcv = bcv.current.eur;
        rates.eurBcvPrev = bcv.previous.eur;
        rates.usdChangePct = bcv.changePercentage.usd;
        rates.eurChangePct = bcv.changePercentage.eur;

        // USDT from paralelo
        const par = Array.isArray(dolares) ? dolares.find(d => d.fuente === 'paralelo') : null;
        rates.usdt = par ? par.promedio : 0;

        checkUpdateStatus(bcv.current.date);
        renderData(bcv);
        renderHistory();
        setupConverter();

    } catch (err) {
        console.error(err);
        showError(err.message || 'Error desconocido');
    }
}

// --- Render ---
function renderData(bcv) {
    const diff = rates.usdBcv - rates.usdBcvPrev;

    setText('currentDate', fmtDate(bcv.current.date));
    setText('previousDate', fmtDate(bcv.previous.date));

    showData();

    animN('currentPrice', rates.usdBcv, 4, 1200);
    animN('previousPrice', rates.usdBcvPrev, 4, 1000);
    animN('euroPrice', rates.eurBcv, 4, 1100);

    if (rates.usdt > 0) {
        animN('usdtPrice', rates.usdt, 2, 1100);
    } else {
        setText('usdtPrice', 'N/D');
    }

    // Change card
    const cc = $('changeCard');
    if (cc) {
        if (rates.usdChangePct > 0.001) {
            cc.className = 'card card-change up';
            setText('changeArrow', '↑');
            setText('changeBadge', 'SUBIÓ');
            const badge = $('changeBadge');
            if (badge) badge.style.cssText = 'background:rgba(255,46,95,0.15);color:#ff2e5f';
        } else if (rates.usdChangePct < -0.001) {
            cc.className = 'card card-change down';
            setText('changeArrow', '↓');
            setText('changeBadge', 'BAJÓ');
            const badge = $('changeBadge');
            if (badge) badge.style.cssText = 'background:rgba(0,229,160,0.15);color:#00e5a0';
        } else {
            cc.className = 'card card-change neutral';
            setText('changeArrow', '→');
            setText('changeBadge', 'SIN CAMBIO');
            const badge = $('changeBadge');
            if (badge) badge.style.cssText = 'background:rgba(255,159,67,0.15);color:#ff9f43';
        }
    }

    setText('changePercent', `${rates.usdChangePct>=0?'+':''}${rates.usdChangePct.toFixed(4)}%`);
    setText('changeAbsolute', `${diff>=0?'+':''}Bs. ${fmtN(diff,4)}`);

    // EUR
    const ec = rates.eurChangePct>0.001 ? '#ff2e5f' : rates.eurChangePct<-0.001 ? '#00e5a0' : '#ff9f43';
    setStyle('euroChangePercent', 'color', ec);
    setText('euroChangePercent', `${rates.eurChangePct>=0?'+':''}${rates.eurChangePct.toFixed(4)}%`);

    // Loss calculator
    const cr = $('calcResult'), ce = $('calcExplanation'), cn = $('calcNoChange');
    if (Math.abs(diff) < 0.0001) {
        if (cr) cr.style.display = 'none';
        if (ce) ce.style.display = 'none';
        if (cn) cn.style.display = 'block';
    } else {
        const needed = Math.abs(rates.usdBcv / diff);
        if (cr) cr.style.display = 'flex';
        if (ce) ce.style.display = 'block';
        if (cn) cn.style.display = 'none';
        animN('dollarsNeeded', needed, 2, 1200);
        if (ce) {
            if (diff > 0) {
                ce.innerHTML = `Si ayer tenías <b style="color:#ff2e5f">${fmtN(needed,2)} USD</b> (= Bs. ${fmtN(needed*rates.usdBcvPrev,2)}), hoy solo valen <b style="color:#9b59b6">${fmtN((needed*rates.usdBcvPrev)/rates.usdBcv,2)} USD</b>. <b style="color:#ff2e5f">Perdiste $1</b> 💀`;
            } else {
                ce.innerHTML = `Si ayer tenías <b style="color:#00e5a0">${fmtN(needed,2)} USD</b>, hoy valen <b style="color:#00e5a0">${fmtN((needed*rates.usdBcvPrev)/rates.usdBcv,2)} USD</b>. <b style="color:#00e5a0">¡Ganaste $1!</b> 🎉`;
            }
        }
    }

    // Gauge
    setText('gaugeValue', `${rates.usdChangePct>=0?'+':''}${rates.usdChangePct.toFixed(4)}%`);
    buildGauge(rates.usdChangePct);

    // Stats
    setText('statDiff', `${diff>=0?'+':''}Bs. ${fmtN(diff,4)}`);
    setStyle('statDiff', 'color', diff>0.001?'#ff2e5f':diff<-0.001?'#00e5a0':'#ff9f43');
    setText('statCentavo', `Bs. ${fmtN(rates.usdBcv/100,4)}`);
    const sal = SALARIO_MINIMO_BS / rates.usdBcv;
    setText('statSalario', `$${sal.toFixed(2)}`);
    setStyle('statSalario', 'color', sal<5?'#ff2e5f':'#00e5a0');

    if (rates.usdChangePct>0.5) { setText('statTendencia','🔺 Fuerte alza'); setStyle('statTendencia','color','#ff2e5f'); }
    else if (rates.usdChangePct>0.01) { setText('statTendencia','📈 Alza leve'); setStyle('statTendencia','color','#ff9f43'); }
    else if (rates.usdChangePct<-0.5) { setText('statTendencia','🔻 Fuerte baja'); setStyle('statTendencia','color','#00e5a0'); }
    else if (rates.usdChangePct<-0.01) { setText('statTendencia','📉 Baja leve'); setStyle('statTendencia','color','#00bfa5'); }
    else { setText('statTendencia','➡️ Estable'); setStyle('statTendencia','color','#ff9f43'); }

    buildComparison();
}

// --- Charts ---
function buildComparison() {
    const canvas = $('comparisonChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (compChart) compChart.destroy();
    compChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['USD Ayer','USD Hoy','EUR Ayer','EUR Hoy'],
            datasets: [{
                data: [rates.usdBcvPrev, rates.usdBcv, rates.eurBcvPrev, rates.eurBcv],
                backgroundColor: ['rgba(0,191,165,0.3)','rgba(0,240,255,0.5)','rgba(88,101,242,0.3)','rgba(88,101,242,0.55)'],
                borderColor: ['rgba(0,191,165,0.7)','rgba(0,240,255,1)','rgba(88,101,242,0.7)','rgba(88,101,242,1)'],
                borderWidth: 2, borderRadius: 6, borderSkipped: false,
            }]
        },
        options: {
            responsive:true, maintainAspectRatio:false,
            plugins: { legend:{display:false}, tooltip:{ backgroundColor:'rgba(6,10,12,0.95)', titleColor:'#e0f7fa', bodyColor:'#80cbc4', borderColor:'rgba(0,240,255,0.2)', borderWidth:1, cornerRadius:8, padding:10, callbacks:{label:c=>`Bs. ${fmtN(c.parsed.y)}`} } },
            scales: { x:{ticks:{color:'#4a7a7f',font:{family:'Outfit',size:10,weight:'600'}},grid:{display:false}}, y:{ticks:{color:'#4a7a7f',font:{family:'JetBrains Mono',size:9},callback:v=>'Bs.'+v.toFixed(0)},grid:{color:'rgba(0,240,255,0.03)'},beginAtZero:false} },
            animation:{duration:1200,easing:'easeOutQuart'},
        }
    });
}

function buildGauge(pct) {
    const canvas = $('gaugeChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (gaugeChart) gaugeChart.destroy();
    const norm = ((Math.max(-5,Math.min(5,pct))+5)/10)*100;
    const col = pct>0.01?'rgba(255,46,95,0.85)':pct<-0.01?'rgba(0,229,160,0.85)':'rgba(255,159,67,0.85)';
    gaugeChart = new Chart(ctx, {
        type:'doughnut',
        data:{ datasets:[{ data:[norm,100-norm], backgroundColor:[col,'rgba(0,240,255,0.04)'], borderWidth:0, circumference:180, rotation:270 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:'78%', plugins:{legend:{display:false},tooltip:{enabled:false}}, animation:{duration:1800,easing:'easeOutElastic'} }
    });
}

function renderHistory(range=30) {
    if (!historyData.length) return;
    const data = range==='all' ? historyData : historyData.slice(-range);
    if (!data.length) return;

    const labels = data.map(d => {
        try { return new Date(d.fecha+'T12:00:00').toLocaleDateString('es-VE',{day:'2-digit',month:'short'}); }
        catch { return d.fecha; }
    });
    const vals = data.map(d => d.promedio);
    const min=Math.min(...vals), max=Math.max(...vals), avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    const chg = ((vals[vals.length-1]-vals[0])/vals[0]*100);

    setText('histMin', `Bs. ${fmtN(min,2)}`);
    setText('histMax', `Bs. ${fmtN(max,2)}`);
    setText('histAvg', `Bs. ${fmtN(avg,2)}`);
    setText('histChange', `${chg>=0?'+':''}${chg.toFixed(2)}%`);
    setStyle('histChange', 'color', chg>0?'#ff2e5f':'#00e5a0');

    const canvas = $('historyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (histChart) histChart.destroy();
    const grad = ctx.createLinearGradient(0,0,0,280);
    grad.addColorStop(0,'rgba(0,240,255,0.2)'); grad.addColorStop(1,'rgba(0,240,255,0.01)');

    histChart = new Chart(ctx, {
        type:'line',
        data:{ labels, datasets:[{ label:'USD BCV', data:vals, borderColor:'#00f0ff', borderWidth:2, backgroundColor:grad, fill:true, tension:0.3, pointRadius:data.length>100?0:2, pointBackgroundColor:'#00f0ff', pointBorderColor:'#060a0c', pointBorderWidth:1, pointHoverRadius:5 }] },
        options:{
            responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
            plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'rgba(6,10,12,0.95)', titleColor:'#e0f7fa', bodyColor:'#80cbc4', borderColor:'rgba(0,240,255,0.2)', borderWidth:1, cornerRadius:8, padding:10, callbacks:{label:c=>`Bs. ${fmtN(c.parsed.y,4)}`} } },
            scales:{ x:{ticks:{color:'#4a7a7f',font:{family:'Outfit',size:9},maxRotation:45,maxTicksLimit:12},grid:{display:false}}, y:{ticks:{color:'#4a7a7f',font:{family:'JetBrains Mono',size:9},callback:v=>'Bs.'+v.toFixed(0)},grid:{color:'rgba(0,240,255,0.03)'}} },
            animation:{duration:1000,easing:'easeOutQuart'},
        }
    });
}

// --- History buttons ---
function setupHistoryButtons() {
    document.querySelectorAll('.h-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.h-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const r = btn.dataset.range;
            renderHistory(r==='all'?'all':parseInt(r));
        });
    });
}

// --- Date Search ---
function setupSearch() {
    const dateInput = $('searchDate');
    const btn = $('searchBtn');
    if (!dateInput || !btn) return;

    dateInput.max = new Date().toISOString().split('T')[0];
    dateInput.min = '2023-01-03';

    function doSearch() {
        const val = dateInput.value;
        if (!val || !historyData.length) return;

        const found = historyData.find(d => d.fecha === val);
        const sr = $('searchResult'), snf = $('searchNotFound');

        if (sr) sr.style.display = found ? 'flex' : 'none';
        if (snf) snf.style.display = found ? 'none' : 'block';

        if (found) {
            setText('searchDateLabel', fmtDate(found.fecha));
            setText('searchPrice', `Bs. ${fmtN(found.promedio, 4)}`);

            const pctVsToday = ((rates.usdBcv - found.promedio) / found.promedio * 100);
            setText('searchDiff', `${pctVsToday>=0?'+':''}${pctVsToday.toFixed(2)}% vs hoy`);
            setStyle('searchDiff', 'color', pctVsToday > 0 ? '#ff2e5f' : '#00e5a0');
        }
    }

    btn.addEventListener('click', doSearch);
    dateInput.addEventListener('keydown', e => { if (e.key==='Enter') doSearch(); });
}

// --- Converter ---
function setupConverter() {
    const amt=$('convAmount'), from=$('convFrom'), to=$('convTo'), res=$('convResult'), rate=$('convRate'), swap=$('swapBtn');
    if (!amt || !from || !to || !res) return;

    function getRate(c) {
        if (c==='USD') return rates.usdBcv;
        if (c==='EUR') return rates.eurBcv;
        if (c==='USDT') return rates.usdt||rates.usdBcv;
        return 1;
    }
    function sym(c) { return {USD:'$',EUR:'€',USDT:'₮',VES:'Bs.'}[c]||''; }

    function convert() {
        const a = parseFloat(amt.value)||0;
        if (!a) { res.textContent='--'; if(rate) rate.textContent=''; return; }
        const fr=getRate(from.value), tr=getRate(to.value);
        const result = (a*fr)/tr;
        res.textContent = `${sym(to.value)} ${fmtN(result, to.value==='VES'?2:4)}`;
        if (rate) rate.textContent = `1 ${from.value} = ${sym(to.value)} ${fmtN(fr/tr, 4)}`;
    }

    amt.addEventListener('input', convert);
    from.addEventListener('change', convert);
    to.addEventListener('change', convert);
    if (swap) swap.addEventListener('click', () => { const t=from.value; from.value=to.value; to.value=t; convert(); });
    convert();
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    setupHistoryButtons();
    setupSearch();
    fetchAllData();
    setInterval(fetchAllData, 5*60*1000);
});
