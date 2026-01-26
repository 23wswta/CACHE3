const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const CMC_API_KEY = process.env.CMC_API_KEY || 'c3989cf0317a4eacbda6802f3c851a16';

async function fetchCMCData() {
    const result = {
        fearGreed: null,
        btcDominance: null,
        altseasonIndex: null,
        lastUpdate: new Date().toISOString(),
        error: null
    };

    // 1. Buscar Global Metrics (BTC Dominance)
    try {
        const response = await fetch('https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest', {
            headers: {
                'X-CMC_PRO_API_KEY': CMC_API_KEY,
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.data?.btc_dominance) {
                result.btcDominance = parseFloat(data.data.btc_dominance.toFixed(2));
                
                // Calcular Altseason baseado na dominância
                // BTC.D 70% = Altseason ~2 (Bitcoin Season forte)
                // BTC.D 60% = Altseason ~16 (Bitcoin Season)
                // BTC.D 50% = Altseason ~30 (Neutro)
                // BTC.D 40% = Altseason ~58 (Altseason)
                // BTC.D 30% = Altseason ~72 (Altseason forte)
                const btcDom = result.btcDominance;
                let altseason = Math.round(100 - (btcDom * 1.4));
                altseason = Math.min(100, Math.max(0, altseason));
                result.altseasonIndex = altseason;
                
                console.log('✅ BTC Dominance:', result.btcDominance + '%');
                console.log('✅ Altseason Index:', result.altseasonIndex);
            }
        } else {
            console.error('❌ Global Metrics falhou:', response.status);
        }
    } catch (e) {
        console.error('❌ Erro ao buscar Global Metrics:', e.message);
    }

    // 2. Buscar Fear & Greed Index
    try {
        const response = await fetch('https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest', {
            headers: {
                'X-CMC_PRO_API_KEY': CMC_API_KEY,
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.data?.value) {
                result.fearGreed = parseInt(data.data.value);
                result.fearGreedClassification = data.data.value_classification || '';
                console.log('✅ Fear & Greed:', result.fearGreed, `(${result.fearGreedClassification})`);
            }
        } else {
            console.error('❌ Fear & Greed falhou:', response.status);
        }
    } catch (e) {
        console.error('❌ Erro ao buscar Fear & Greed:', e.message);
    }

    return result;
}

async function main() {
    console.log('🚀 Buscando dados do CoinMarketCap...');
    console.log('📅 Data:', new Date().toISOString());
    
    const data = await fetchCMCData();
    
    // Criar diretório data se não existir
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Salvar JSON
    const filePath = path.join(dataDir, 'cmc-data.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    console.log('💾 Dados salvos em:', filePath);
    console.log('📊 Resultado:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
