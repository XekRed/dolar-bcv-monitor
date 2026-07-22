/* ============================================
   XEKRED BCV MONITOR — App Logic
   ============================================ */

const API_BCV = 'https://rates.dolarvzla.com/bcv/current.json';
const API_DOLARES = 'https://ve.dolarapi.com/v1/dolares';
const API_HISTORY = 'https://ve.dolarapi.com/v1/historicos/dolares/oficial';
const SALARIO_MINIMO_BS = 130;

let rates = { usdBcv:0, usdBcvPrev:0, eurBcv:0, eurBcvPrev:0, usdt:0, usdChangePct:0, eurChangePct:0 };
let historyData = [];
let compChart = null, gaugeChart = null, histChart = null;

const $ = id => document.getElementById(id);

// --- Particles ---
function createParticles() {
    const c = $('particles');
    const colors = ['rgba(0,240,255,0.3)','rgba(0,191,165,0.2)','rgba(88,101,242,0.18)','rgba(0,229,160,0.18)'];
    for (let i = 0; i < 25; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const s = Math.random()*3+1;
        const col = colors[Math.floor(Math.random()*colors.length)];
        p.style.cssText = `width:${s}px;height:${s}px;background:${col};box-shadow:0 0 ${s*3}px ${col};left:${Math.random()*100}%;animation-duration:${Math.random()*15+10}s;animation-delay:${Math.random()*15}s;`;
        c.appendChild(p);
    }
}

// --- Helpers ---
function fmtDate(s) {
    const d = new Date(s + (s.includes('T') ? '' : 'T12:00:00'));
    return d.toLocaleDateString('es-VE', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
}
function fmtN(n, d=4) { return n.toLocaleString('es-VE', { minimumFractionDigits:d, maximumFractionDigits:d }); }
function animN(el, target, dec=4, dur=1000) {
    const t0 = performance.now();
    (function step(now) {
        const p = Math.min((now-t0)/dur, 1);
        el.textContent = fmtN(target * (1 - Math.pow(1-p, 3)), dec);
        if (p < 1) requestAnimationFrame(step);
    })(t0);
}

// --- UI States ---
function showLoading() { $('loadingOverlay').style.display='flex'; $('errorPanel').style.display='none'; $('dataContent').style.display='none'; }
function showError(msg) {
    $('loadingOverlay').style.display='none'; $('errorPanel').style.display='block'; $('dataContent').style.display='none';
    $('errorMessage').textContent = msg;
    const b = $('liveBadge'); b.classList.remove('live'); b.querySelector('span:last-child').textContent = 'ERROR';
}
function showData() {
    $('loadingOverlay').style.display='none'; $('errorPanel').style.display='none'; $('dataContent').style.display='block';
    const b = $('liveBadge'); b.classList.add('live'); b.querySelector('span:last-child').textContent = 'EN VIVO';
    document.querySelectorAll('.data-content .card').forEach(c => c.classList.add('fade-in-up'));
}

// --- Check if BCV updated today ---
function checkUpdateStatus(currentDate) {
    const us = $('updateStatus');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;

    if (currentDate === todayStr) {
        us.className = 'update-status updated';
        $('updateText').textContent = '✓ Actualizado hoy';
    } else if (isWeekend) {
        us.className = 'update-status updated';
        $('updateText').textContent = 'Fin de semana';
    } else {
        us.className = 'update-status not-updated';
        $('updateText').textContent = 'No actualizado aún';
    }
}

// --- Fetch ---
async function fetchAllData() {
    showLoading();
    try {
        const [bcvR, dolR, histR] = await Promise.all([fetch(API_BCV), fetch(API_DOLARES), fetch(API_HISTORY)]);
        if (!bcvR.ok) throw new Error(`BCV: ${bcvR.status}`);
        const bcv = await bcvR.json();
        const dolares = dolR.ok ? await dolR.json() : [];
        historyData = histR.ok ? await histR.json() : [];

        rates.usdBcv = bcv.current.usd;
        rates.usdBcvPrev = bcv.previous.usd;
        rates.eurBcv = bcv.current.eur;
        rates.eurBcvPrev = bcv.previous.eur;
        rates.usdChangePct = bcv.changePercentage.usd;
        rates.eurChangePct = bcv.changePercentage.eur;

        const par = dolares.find(d => d.fuente === 'paralelo');
        rates.usdt = par ? par.promedio : 0;

        checkUpdateStatus(bcv.current.date);
        renderData(bcv);
        renderHistory();
        setupConverter();
    } catch (err) {
        console.error(err);
        showError(`Error: ${err.message}`);
    }
}

// --- Render ---
function renderData(bcv) {
    const diff = rates.usdBcv - rates.usdBcvPrev;
    $('currentDate').textContent = fmtDate(bcv.current.date);
    $('previousDate').textContent = fmtDate(bcv.previous.date);
    showData();

    animN($('currentPrice'), rates.usdBcv, 4, 1200);
    animN($('previousPrice'), rates.usdBcvPrev, 4, 1000);
    animN($('euroPrice'), rates.eurBcv, 4, 1100);
    if (rates.usdt > 0) animN($('usdtPrice'), rates.usdt, 2, 1100);
    else $('usdtPrice').textContent = 'N/D';

    // Change
    const cc = $('changeCard');
    if (rates.usdChangePct > 0.001) {
        cc.className='card card-change up'; $('changeArrow').textContent='↑';
        $('changeBadge').textContent='SUBIÓ'; $('changeBadge').style.cssText='background:rgba(255,46,95,0.15);color:#ff2e5f';
    } else if (rates.usdChangePct < -0.001) {
        cc.className='card card-change down'; $('changeArrow').textContent='↓';
        $('changeBadge').textContent='BAJÓ'; $('changeBadge').style.cssText='background:rgba(0,229,160,0.15);color:#00e5a0';
    } else {
        cc.className='card card-change neutral'; $('changeArrow').textContent='→';
        $('changeBadge').textContent='SIN CAMBIO'; $('changeBadge').style.cssText='background:rgba(255,159,67,0.15);color:#ff9f43';
    }
    $('changePercent').textContent = `${rates.usdChangePct>=0?'+':''}${rates.usdChangePct.toFixed(4)}%`;
    $('changeAbsolute').textContent = `${diff>=0?'+':''}Bs. ${fmtN(diff,4)}`;

    // EUR
    const ec = rates.eurChangePct>0.001?'#ff2e5f':rates.eurChangePct<-0.001?'#00e5a0':'#ff9f43';
    $('euroChangePercent').style.color = ec;
    $('euroChangePercent').textContent = `${rates.eurChangePct>=0?'+':''}${rates.eurChangePct.toFixed(4)}%`;

    // Loss calc
    if (Math.abs(diff) < 0.0001) {
        $('calcResult').style.display='none'; $('calcExplanation').style.display='none'; $('calcNoChange').style.display='block';
    } else {
        const needed = Math.abs(rates.usdBcv / diff);
        $('calcResult').style.display='flex'; $('calcExplanation').style.display='block'; $('calcNoChange').style.display='none';
        animN($('dollarsNeeded'), needed, 2, 1200);
        if (diff > 0) {
            $('calcExplanation').innerHTML = `Si ayer tenías <b style="color:#ff2e5f">${fmtN(needed,2)} USD</b> (= Bs. ${fmtN(needed*rates.usdBcvPrev,2)}), hoy solo valen <b style="color:#9b59b6">${fmtN((needed*rates.usdBcvPrev)/rates.usdBcv,2)} USD</b>. <b style="color:#ff2e5f">Perdiste $1</b> 💀`;
        } else {
            $('calcExplanation').innerHTML = `Si ayer tenías <b style="color:#00e5a0">${fmtN(needed,2)} USD</b>, hoy valen <b style="color:#00e5a0">${fmtN((needed*rates.usdBcvPrev)/rates.usdBcv,2)} USD</b>. <b style="color:#00e5a0">¡Ganaste $1!</b> 🎉`;
        }
    }

    // Gauge
    $('gaugeValue').textContent = `${rates.usdChangePct>=0?'+':''}${rates.usdChangePct.toFixed(4)}%`;
    buildGauge(rates.usdChangePct);

    // Stats
    $('statDiff').textContent = `${diff>=0?'+':''}Bs. ${fmtN(diff,4)}`;
    $('statDiff').style.color = diff>0.001?'#ff2e5f':diff<-0.001?'#00e5a0':'#ff9f43';
    $('statCentavo').textContent = `Bs. ${fmtN(rates.usdBcv/100,4)}`;
    const sal = SALARIO_MINIMO_BS/rates.usdBcv;
    $('statSalario').textContent = `$${sal.toFixed(2)}`;
    $('statSalario').style.color = sal<5?'#ff2e5f':'#00e5a0';
    if (rates.usdChangePct>0.5) { $('statTendencia').textContent='🔺 Fuerte alza'; $('statTendencia').style.color='#ff2e5f'; }
    else if (rates.usdChangePct>0.01) { $('statTendencia').textContent='📈 Alza leve'; $('statTendencia').style.color='#ff9f43'; }
    else if (rates.usdChangePct<-0.5) { $('statTendencia').textContent='🔻 Fuerte baja'; $('statTendencia').style.color='#00e5a0'; }
    else if (rates.usdChangePct<-0.01) { $('statTendencia').textContent='📉 Baja leve'; $('statTendencia').style.color='#00bfa5'; }
    else { $('statTendencia').textContent='➡️ Estable'; $('statTendencia').style.color='#ff9f43'; }

    buildComparison();
}

// --- Charts ---
function buildComparison() {
    const ctx = $('comparisonChart').getContext('2d');
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
            plugins: { legend:{display:false}, tooltip:{ backgroundColor:'rgba(6,10,12,0.95)', titleColor:'#e0f7fa', bodyColor:'#80cbc4', borderColor:'rgba(0,240,255,0.2)', borderWidth:1, cornerRadius:8, padding:10, titleFont:{family:'Outfit',weight:'600',size:12}, bodyFont:{family:'JetBrains Mono',size:11}, callbacks:{label:c=>`Bs. ${fmtN(c.parsed.y)}`} } },
            scales: { x:{ticks:{color:'#4a7a7f',font:{family:'Outfit',size:10,weight:'600'}},grid:{display:false},border:{color:'rgba(0,240,255,0.05)'}}, y:{ticks:{color:'#4a7a7f',font:{family:'JetBrains Mono',size:9},callback:v=>'Bs.'+v.toFixed(0)},grid:{color:'rgba(0,240,255,0.03)'},border:{display:false},beginAtZero:false} },
            animation:{duration:1200,easing:'easeOutQuart'},
        }
    });
}

function buildGauge(pct) {
    const ctx = $('gaugeChart').getContext('2d');
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
    const labels = data.map(d => { const dt=new Date(d.fecha+'T12:00:00'); return dt.toLocaleDateString('es-VE',{day:'2-digit',month:'short'}); });
    const vals = data.map(d => d.promedio);
    const min=Math.min(...vals), max=Math.max(...vals), avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    const chg = ((vals[vals.length-1]-vals[0])/vals[0]*100);

    $('histMin').textContent = `Bs. ${fmtN(min,2)}`;
    $('histMax').textContent = `Bs. ${fmtN(max,2)}`;
    $('histAvg').textContent = `Bs. ${fmtN(avg,2)}`;
    $('histChange').textContent = `${chg>=0?'+':''}${chg.toFixed(2)}%`;
    $('histChange').style.color = chg>0?'#ff2e5f':'#00e5a0';

    const ctx = $('historyChart').getContext('2d');
    if (histChart) histChart.destroy();
    const grad = ctx.createLinearGradient(0,0,0,280);
    grad.addColorStop(0,'rgba(0,240,255,0.2)'); grad.addColorStop(1,'rgba(0,240,255,0.01)');

    histChart = new Chart(ctx, {
        type:'line',
        data:{ labels, datasets:[{ label:'USD BCV', data:vals, borderColor:'#00f0ff', borderWidth:2, backgroundColor:grad, fill:true, tension:0.3, pointRadius:data.length>100?0:2, pointBackgroundColor:'#00f0ff', pointBorderColor:'#060a0c', pointBorderWidth:1, pointHoverRadius:5 }] },
        options:{
            responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
            plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'rgba(6,10,12,0.95)', titleColor:'#e0f7fa', bodyColor:'#80cbc4', borderColor:'rgba(0,240,255,0.2)', borderWidth:1, cornerRadius:8, padding:10, titleFont:{family:'Outfit',weight:'600',size:12}, bodyFont:{family:'JetBrains Mono',size:11}, callbacks:{label:c=>`Bs. ${fmtN(c.parsed.y,4)}`} } },
            scales:{ x:{ticks:{color:'#4a7a7f',font:{family:'Outfit',size:9},maxRotation:45,maxTicksLimit:12},grid:{display:false},border:{color:'rgba(0,240,255,0.05)'}}, y:{ticks:{color:'#4a7a7f',font:{family:'JetBrains Mono',size:9},callback:v=>'Bs.'+v.toFixed(0)},grid:{color:'rgba(0,240,255,0.03)'},border:{display:false}} },
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

    // Set max to today
    dateInput.max = new Date().toISOString().split('T')[0];
    dateInput.min = '2023-01-03';

    btn.addEventListener('click', doSearch);
    dateInput.addEventListener('keydown', e => { if (e.key==='Enter') doSearch(); });

    function doSearch() {
        const val = dateInput.value;
        if (!val) return;

        const found = historyData.find(d => d.fecha === val);
        $('searchResult').style.display = found ? 'flex' : 'none';
        $('searchNotFound').style.display = found ? 'none' : 'block';

        if (found) {
            $('searchDateLabel').textContent = fmtDate(found.fecha);
            $('searchPrice').textContent = `Bs. ${fmtN(found.promedio, 4)}`;

            // Compare with today
            const diffVsToday = rates.usdBcv - found.promedio;
            const pctVsToday = ((rates.usdBcv - found.promedio) / found.promedio * 100);
            const el = $('searchDiff');
            el.textContent = `${pctVsToday>=0?'+':''}${pctVsToday.toFixed(2)}% vs hoy`;
            el.style.color = pctVsToday > 0 ? '#ff2e5f' : '#00e5a0';
        }
    }
}

// --- Converter ---
function setupConverter() {
    const amt=$('convAmount'), from=$('convFrom'), to=$('convTo'), res=$('convResult'), rate=$('convRate'), swap=$('swapBtn');

    function getRate(c) {
        if (c==='USD') return rates.usdBcv;
        if (c==='EUR') return rates.eurBcv;
        if (c==='USDT') return rates.usdt||rates.usdBcv;
        return 1;
    }
    function sym(c) { return {USD:'$',EUR:'€',USDT:'₮',VES:'Bs.'}[c]||''; }

    function convert() {
        const a = parseFloat(amt.value)||0;
        if (!a) { res.textContent='--'; rate.textContent=''; return; }
        const fr=getRate(from.value), tr=getRate(to.value);
        const result = (a*fr)/tr;
        res.textContent = `${sym(to.value)} ${fmtN(result, to.value==='VES'?2:4)}`;
        rate.textContent = `1 ${from.value} = ${sym(to.value)} ${fmtN(fr/tr, 4)}`;
    }

    amt.addEventListener('input', convert);
    from.addEventListener('change', convert);
    to.addEventListener('change', convert);
    swap.addEventListener('click', () => { const t=from.value; from.value=to.value; to.value=t; convert(); });
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
