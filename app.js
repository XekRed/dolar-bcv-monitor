/* ============================================
   XEKRED BCV DOLLAR MONITOR
   Main Application Logic
   ============================================ */

// --- API Configuration ---
const API_BCV = 'https://rates.dolarvzla.com/bcv/current.json';
const API_DOLARES = 'https://ve.dolarapi.com/v1/dolares';
const API_HISTORY = 'https://ve.dolarapi.com/v1/historicos/dolares/oficial';
const SALARIO_MINIMO_BS = 130;

// --- State ---
let rates = {
    usdBcv: 0,
    usdBcvPrev: 0,
    eurBcv: 0,
    eurBcvPrev: 0,
    usdParalelo: 0,
    usdt: 0,
    usdChangePct: 0,
    eurChangePct: 0,
};
let historyData = [];
let comparisonChart = null;
let gaugeChart = null;
let historyChart = null;

// --- DOM ---
const $ = id => document.getElementById(id);

// --- Particles ---
function createParticles() {
    const container = $('particles');
    const colors = [
        'rgba(0, 240, 255, 0.35)',
        'rgba(0, 191, 165, 0.25)',
        'rgba(88, 101, 242, 0.2)',
        'rgba(0, 229, 160, 0.2)',
    ];
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 4 + 1;
        const color = colors[Math.floor(Math.random() * colors.length)];
        p.style.cssText = `
            width:${size}px; height:${size}px;
            background:${color}; box-shadow:0 0 ${size*3}px ${color};
            left:${Math.random()*100}%;
            animation-duration:${Math.random()*15+10}s;
            animation-delay:${Math.random()*15}s;
        `;
        container.appendChild(p);
    }
}

// --- Helpers ---
function formatDate(dateStr) {
    const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00'));
    return d.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function formatNum(n, dec = 4) {
    return n.toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function animateNum(el, target, dec = 4, dur = 1200) {
    const t0 = performance.now();
    (function step(now) {
        const p = Math.min((now - t0) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        el.textContent = formatNum(target * ease, dec);
        if (p < 1) requestAnimationFrame(step);
    })(t0);
}

// --- UI States ---
function showLoading() {
    $('loadingOverlay').style.display = 'flex';
    $('errorPanel').style.display = 'none';
    $('dataContent').style.display = 'none';
}

function showError(msg) {
    $('loadingOverlay').style.display = 'none';
    $('errorPanel').style.display = 'block';
    $('dataContent').style.display = 'none';
    $('errorMessage').textContent = msg;
    const badge = $('liveBadge');
    badge.classList.remove('live');
    badge.querySelector('span:last-child').textContent = 'ERROR';
}

function showData() {
    $('loadingOverlay').style.display = 'none';
    $('errorPanel').style.display = 'none';
    $('dataContent').style.display = 'block';
    const badge = $('liveBadge');
    badge.classList.add('live');
    badge.querySelector('span:last-child').textContent = 'EN VIVO';
    document.querySelectorAll('.data-content .card').forEach(c => c.classList.add('fade-in-up'));
}

// --- Fetch all data ---
async function fetchAllData() {
    showLoading();
    try {
        const [bcvRes, dolaresRes, histRes] = await Promise.all([
            fetch(API_BCV),
            fetch(API_DOLARES),
            fetch(API_HISTORY),
        ]);

        if (!bcvRes.ok) throw new Error(`BCV API error: ${bcvRes.status}`);

        const bcv = await bcvRes.json();
        const dolares = dolaresRes.ok ? await dolaresRes.json() : [];
        historyData = histRes.ok ? await histRes.json() : [];

        // BCV data
        rates.usdBcv = bcv.current.usd;
        rates.usdBcvPrev = bcv.previous.usd;
        rates.eurBcv = bcv.current.eur;
        rates.eurBcvPrev = bcv.previous.eur;
        rates.usdChangePct = bcv.changePercentage.usd;
        rates.eurChangePct = bcv.changePercentage.eur;

        // DolarAPI data
        const paralelo = dolares.find(d => d.fuente === 'paralelo');
        rates.usdParalelo = paralelo ? paralelo.promedio : 0;

        // USDT - use paralelo as approximate P2P reference
        // The paralelo rate closely mirrors USDT P2P rate
        rates.usdt = rates.usdParalelo;

        renderData(bcv);
        renderHistory();
        setupConverter();

    } catch (err) {
        console.error('Fetch error:', err);
        showError(`No se pudo conectar: ${err.message}`);
    }
}

// --- Render main data ---
function renderData(bcv) {
    const { current, previous } = bcv;
    const usdDiff = rates.usdBcv - rates.usdBcvPrev;

    // Dates
    $('currentDate').textContent = formatDate(current.date);
    $('previousDate').textContent = formatDate(previous.date);

    showData();

    // Prices
    animateNum($('currentPrice'), rates.usdBcv, 4, 1400);
    animateNum($('previousPrice'), rates.usdBcvPrev, 4, 1200);
    animateNum($('euroPrice'), rates.eurBcv, 4, 1300);

    // Paralelo
    if (rates.usdParalelo > 0) {
        animateNum($('paraleloPrice'), rates.usdParalelo, 2, 1300);
        $('paraleloDate').textContent = 'Hoy';
    } else {
        $('paraleloPrice').textContent = 'N/D';
    }

    // USDT
    if (rates.usdt > 0) {
        animateNum($('usdtPrice'), rates.usdt, 2, 1300);
        $('usdtSub').textContent = 'Tasa paralela / P2P';
    } else {
        $('usdtPrice').textContent = 'N/D';
    }

    // Change card
    const cc = $('changeCard');
    if (rates.usdChangePct > 0.001) {
        cc.className = 'card card-change up';
        $('changeArrow').textContent = '↑';
        $('changeBadge').textContent = 'SUBIÓ';
        $('changeBadge').style.cssText = 'background:rgba(255,46,95,0.15);color:#ff2e5f';
    } else if (rates.usdChangePct < -0.001) {
        cc.className = 'card card-change down';
        $('changeArrow').textContent = '↓';
        $('changeBadge').textContent = 'BAJÓ';
        $('changeBadge').style.cssText = 'background:rgba(0,229,160,0.15);color:#00e5a0';
    } else {
        cc.className = 'card card-change neutral';
        $('changeArrow').textContent = '→';
        $('changeBadge').textContent = 'SIN CAMBIO';
        $('changeBadge').style.cssText = 'background:rgba(255,159,67,0.15);color:#ff9f43';
    }

    $('changePercent').textContent = `${rates.usdChangePct >= 0 ? '+' : ''}${rates.usdChangePct.toFixed(4)}%`;
    $('changeAbsolute').textContent = `${usdDiff >= 0 ? '+' : ''}Bs. ${formatNum(usdDiff, 4)}`;

    // EUR change
    const eurColor = rates.eurChangePct > 0.001 ? '#ff2e5f' : rates.eurChangePct < -0.001 ? '#00e5a0' : '#ff9f43';
    $('euroChangePercent').style.color = eurColor;
    $('euroChangePercent').textContent = `${rates.eurChangePct >= 0 ? '+' : ''}${rates.eurChangePct.toFixed(4)}%`;

    // Loss calculator
    const diff = rates.usdBcv - rates.usdBcvPrev;
    if (Math.abs(diff) < 0.0001) {
        $('calcResult').style.display = 'none';
        $('calcExplanation').style.display = 'none';
        $('calcNoChange').style.display = 'block';
    } else {
        const needed = Math.abs(rates.usdBcv / diff);
        $('calcResult').style.display = 'flex';
        $('calcExplanation').style.display = 'block';
        $('calcNoChange').style.display = 'none';
        animateNum($('dollarsNeeded'), needed, 2, 1500);

        if (diff > 0) {
            $('calcExplanation').innerHTML = `
                Si ayer tenías <strong style="color:#ff2e5f">${formatNum(needed, 2)} USD</strong>
                (= Bs. ${formatNum(needed * rates.usdBcvPrev, 2)}),<br>
                hoy esos bolívares solo valen
                <strong style="color:#9b59b6">${formatNum((needed * rates.usdBcvPrev) / rates.usdBcv, 2)} USD</strong>.<br>
                <strong style="color:#ff2e5f">Perdiste 1 USD</strong> en poder adquisitivo. 💀`;
        } else {
            $('calcExplanation').innerHTML = `
                Si ayer tenías <strong style="color:#00e5a0">${formatNum(needed, 2)} USD</strong>
                (= Bs. ${formatNum(needed * rates.usdBcvPrev, 2)}),<br>
                hoy esos bolívares valen
                <strong style="color:#00e5a0">${formatNum((needed * rates.usdBcvPrev) / rates.usdBcv, 2)} USD</strong>.<br>
                <strong style="color:#00e5a0">¡Ganaste 1 USD!</strong> 🎉`;
        }
    }

    // Gauge
    $('gaugeValue').textContent = `${rates.usdChangePct >= 0 ? '+' : ''}${rates.usdChangePct.toFixed(4)}%`;
    buildGaugeChart(rates.usdChangePct);

    // Quick stats
    $('statDiff').textContent = `${usdDiff >= 0 ? '+' : ''}Bs. ${formatNum(usdDiff, 4)}`;
    $('statDiff').style.color = usdDiff > 0.001 ? '#ff2e5f' : usdDiff < -0.001 ? '#00e5a0' : '#ff9f43';

    $('statCentavo').textContent = `Bs. ${formatNum(rates.usdBcv / 100, 4)}`;

    const salUsd = SALARIO_MINIMO_BS / rates.usdBcv;
    $('statSalario').textContent = `$${salUsd.toFixed(2)}`;
    $('statSalario').style.color = salUsd < 5 ? '#ff2e5f' : '#00e5a0';

    if (rates.usdChangePct > 0.5) {
        $('statTendencia').textContent = '🔺 Fuerte alza';
        $('statTendencia').style.color = '#ff2e5f';
    } else if (rates.usdChangePct > 0.01) {
        $('statTendencia').textContent = '📈 Alza leve';
        $('statTendencia').style.color = '#ff9f43';
    } else if (rates.usdChangePct < -0.5) {
        $('statTendencia').textContent = '🔻 Fuerte baja';
        $('statTendencia').style.color = '#00e5a0';
    } else if (rates.usdChangePct < -0.01) {
        $('statTendencia').textContent = '📉 Baja leve';
        $('statTendencia').style.color = '#00bfa5';
    } else {
        $('statTendencia').textContent = '➡️ Estable';
        $('statTendencia').style.color = '#ff9f43';
    }

    // Brecha
    if (rates.usdParalelo > 0) {
        const brecha = ((rates.usdParalelo - rates.usdBcv) / rates.usdBcv * 100);
        $('statBrecha').textContent = `${brecha.toFixed(2)}%`;
        $('statBrecha').style.color = brecha > 10 ? '#ff2e5f' : '#00e5a0';
    } else {
        $('statBrecha').textContent = 'N/D';
    }

    $('statUpdate').textContent = new Date().toLocaleTimeString('es-VE');

    // Comparison chart
    buildComparisonChart();
}

// --- Comparison Chart ---
function buildComparisonChart() {
    const ctx = $('comparisonChart').getContext('2d');
    if (comparisonChart) comparisonChart.destroy();

    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['USD Ayer', 'USD Hoy', 'EUR Ayer', 'EUR Hoy', 'Paralelo'],
            datasets: [{
                label: 'Tasa en Bs.',
                data: [rates.usdBcvPrev, rates.usdBcv, rates.eurBcvPrev, rates.eurBcv, rates.usdParalelo],
                backgroundColor: [
                    'rgba(0, 191, 165, 0.35)',
                    'rgba(0, 240, 255, 0.55)',
                    'rgba(88, 101, 242, 0.35)',
                    'rgba(88, 101, 242, 0.6)',
                    'rgba(255, 159, 67, 0.45)',
                ],
                borderColor: [
                    'rgba(0, 191, 165, 0.8)',
                    'rgba(0, 240, 255, 1)',
                    'rgba(88, 101, 242, 0.8)',
                    'rgba(88, 101, 242, 1)',
                    'rgba(255, 159, 67, 0.9)',
                ],
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(6, 10, 12, 0.95)',
                    titleColor: '#e0f7fa',
                    bodyColor: '#80cbc4',
                    borderColor: 'rgba(0, 240, 255, 0.3)',
                    borderWidth: 1, cornerRadius: 10, padding: 14,
                    titleFont: { family: 'Outfit', weight: '600', size: 13 },
                    bodyFont: { family: 'JetBrains Mono', size: 12 },
                    callbacks: {
                        label: ctx => `Bs. ${formatNum(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#4a7a7f', font: { family: 'Outfit', size: 11, weight: '600' } },
                    grid: { display: false },
                    border: { color: 'rgba(0,240,255,0.05)' },
                },
                y: {
                    ticks: {
                        color: '#4a7a7f',
                        font: { family: 'JetBrains Mono', size: 10 },
                        callback: v => 'Bs.' + v.toFixed(0),
                    },
                    grid: { color: 'rgba(0, 240, 255, 0.03)' },
                    border: { display: false },
                    beginAtZero: false,
                }
            },
            animation: { duration: 1500, easing: 'easeOutQuart' },
        }
    });
}

// --- Gauge Chart ---
function buildGaugeChart(pct) {
    const ctx = $('gaugeChart').getContext('2d');
    if (gaugeChart) gaugeChart.destroy();

    const clamped = Math.max(-5, Math.min(5, pct));
    const norm = ((clamped + 5) / 10) * 100;

    let color;
    if (pct > 0.01) color = 'rgba(255, 46, 95, 0.85)';
    else if (pct < -0.01) color = 'rgba(0, 229, 160, 0.85)';
    else color = 'rgba(255, 159, 67, 0.85)';

    gaugeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [norm, 100 - norm],
                backgroundColor: [color, 'rgba(0, 240, 255, 0.04)'],
                borderWidth: 0,
                circumference: 180,
                rotation: 270,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '78%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { duration: 2000, easing: 'easeOutElastic' },
        }
    });
}

// --- History Chart ---
function renderHistory(range = 30) {
    if (!historyData.length) return;

    let data;
    if (range === 'all') {
        data = historyData;
    } else {
        data = historyData.slice(-range);
    }

    const labels = data.map(d => {
        const dt = new Date(d.fecha + 'T12:00:00');
        return dt.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    });
    const values = data.map(d => d.promedio);

    // Stats
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const totalChange = ((values[values.length - 1] - values[0]) / values[0] * 100);

    $('histMin').textContent = `Bs. ${formatNum(min, 2)}`;
    $('histMax').textContent = `Bs. ${formatNum(max, 2)}`;
    $('histAvg').textContent = `Bs. ${formatNum(avg, 2)}`;
    $('histChange').textContent = `${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(2)}%`;
    $('histChange').style.color = totalChange > 0 ? '#ff2e5f' : '#00e5a0';

    const ctx = $('historyChart').getContext('2d');
    if (historyChart) historyChart.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 340);
    gradient.addColorStop(0, 'rgba(0, 240, 255, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 240, 255, 0.01)');

    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'USD BCV',
                data: values,
                borderColor: '#00f0ff',
                borderWidth: 2,
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                pointRadius: data.length > 100 ? 0 : 3,
                pointBackgroundColor: '#00f0ff',
                pointBorderColor: '#060a0c',
                pointBorderWidth: 2,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#00f0ff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(6, 10, 12, 0.95)',
                    titleColor: '#e0f7fa',
                    bodyColor: '#80cbc4',
                    borderColor: 'rgba(0, 240, 255, 0.3)',
                    borderWidth: 1, cornerRadius: 10, padding: 14,
                    titleFont: { family: 'Outfit', weight: '600', size: 13 },
                    bodyFont: { family: 'JetBrains Mono', size: 12 },
                    callbacks: {
                        label: ctx => `Bs. ${formatNum(ctx.parsed.y, 4)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#4a7a7f',
                        font: { family: 'Outfit', size: 10 },
                        maxRotation: 45,
                        maxTicksLimit: 15,
                    },
                    grid: { display: false },
                    border: { color: 'rgba(0,240,255,0.05)' },
                },
                y: {
                    ticks: {
                        color: '#4a7a7f',
                        font: { family: 'JetBrains Mono', size: 10 },
                        callback: v => 'Bs.' + v.toFixed(0),
                    },
                    grid: { color: 'rgba(0, 240, 255, 0.03)' },
                    border: { display: false },
                }
            },
            animation: { duration: 1200, easing: 'easeOutQuart' },
        }
    });
}

// --- History range buttons ---
function setupHistoryButtons() {
    document.querySelectorAll('.history-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.history-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const range = btn.dataset.range;
            renderHistory(range === 'all' ? 'all' : parseInt(range));
        });
    });
}

// --- Currency Converter ---
function setupConverter() {
    const amountEl = $('convAmount');
    const fromEl = $('convFrom');
    const toEl = $('convTo');
    const resultEl = $('convResult');
    const rateEl = $('convRate');
    const swapEl = $('swapBtn');

    function getRateInBs(currency) {
        switch (currency) {
            case 'USD': return rates.usdBcv;
            case 'EUR': return rates.eurBcv;
            case 'USDT': return rates.usdt || rates.usdParalelo || rates.usdBcv;
            case 'VES': return 1;
            default: return 1;
        }
    }

    function getCurrencySymbol(currency) {
        switch (currency) {
            case 'USD': return '$';
            case 'EUR': return '€';
            case 'USDT': return '₮';
            case 'VES': return 'Bs.';
            default: return '';
        }
    }

    function convert() {
        const amount = parseFloat(amountEl.value) || 0;
        const from = fromEl.value;
        const to = toEl.value;

        if (amount === 0) {
            resultEl.textContent = '--';
            rateEl.textContent = '';
            return;
        }

        const fromRate = getRateInBs(from);
        const toRate = getRateInBs(to);

        // Convert: amount * (fromRate / toRate)
        const amountInBs = amount * fromRate;
        const result = amountInBs / toRate;

        resultEl.textContent = `${getCurrencySymbol(to)} ${formatNum(result, to === 'VES' ? 2 : 4)}`;

        const exchangeRate = fromRate / toRate;
        rateEl.textContent = `1 ${from} = ${getCurrencySymbol(to)} ${formatNum(exchangeRate, 4)}`;
    }

    amountEl.addEventListener('input', convert);
    fromEl.addEventListener('change', convert);
    toEl.addEventListener('change', convert);
    swapEl.addEventListener('click', () => {
        const temp = fromEl.value;
        fromEl.value = toEl.value;
        toEl.value = temp;
        convert();
    });

    convert();
}

// --- Init ---
function init() {
    createParticles();
    setupHistoryButtons();
    fetchAllData();
    setInterval(fetchAllData, 5 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
