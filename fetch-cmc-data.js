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
                console.log('✅ BTC Dominance:', result.btcDominance + '%');
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

    // 3. Calcular Altseason Index (Top 50 vs BTC nos últimos 90 dias)
    try {
        console.log('📊 Calculando Altseason Index (90 dias)...');
        
        // Buscar Top 100 coins com variação de 90 dias do CoinGecko
        const response = await fetch(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=90d',
            { headers: { 'Accept': 'application/json' } }
        );

        if (response.ok) {
            const coins = await response.json();
            
            // Encontrar BTC
            const btc = coins.find(c => c.id === 'bitcoin');
            if (!btc) throw new Error('BTC não encontrado');
            
            const btcChange90d = btc.price_change_percentage_90d_in_currency || 0;
            console.log('   BTC 90d:', btcChange90d.toFixed(2) + '%');
            
            // Filtrar altcoins (excluir BTC, stablecoins, wrapped tokens)
            const excluded = [
                'bitcoin', 'tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd', 
                'pax-dollar', 'first-digital-usd', 'ethena-usde', 'usds',
                'wrapped-bitcoin', 'steth', 'weth', 'wrapped-steth', 'cbeth',
                'rocket-pool-eth', 'frax-ether', 'coinbase-wrapped-btc'
            ];
            
            const altcoins = coins.filter(c => 
                !excluded.includes(c.id) && 
                c.price_change_percentage_90d_in_currency !== null
            ).slice(0, 50);
            
            // Contar quantas altcoins superaram BTC
            let outperformCount = 0;
            altcoins.forEach(coin => {
                const altChange = coin.price_change_percentage_90d_in_currency || 0;
                if (altChange > btcChange90d) {
                    outperformCount++;
                }
            });
            
            // Altseason Index = % de altcoins que superaram BTC
            // 75%+ = Altseason, 25%- = Bitcoin Season
            const altseasonValue = Math.round((outperformCount / altcoins.length) * 100);
            result.altseasonIndex = altseasonValue;
            
            console.log(`✅ Altseason Index: ${altseasonValue} (${outperformCount}/${altcoins.length} altcoins > BTC)`);
        } else {
            console.error('❌ CoinGecko falhou:', response.status);
            // Fallback: usar cálculo baseado em dominância
            if (result.btcDominance) {
                result.altseasonIndex = Math.round(100 - (result.btcDominance * 1.4));
                result.altseasonIndex = Math.min(100, Math.max(0, result.altseasonIndex));
                console.log('⚠️ Altseason (fallback):', result.altseasonIndex);
            }
        }
    } catch (e) {
        console.error('❌ Erro ao calcular Altseason:', e.message);
        // Fallback
        if (result.btcDominance) {
            result.altseasonIndex = Math.round(100 - (result.btcDominance * 1.4));
            result.altseasonIndex = Math.min(100, Math.max(0, result.altseasonIndex));
        }
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
