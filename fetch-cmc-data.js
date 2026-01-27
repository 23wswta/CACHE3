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

    // 3. Calcular Altseason Index (Top 50 vs BTC)
    // Usando dados de ATH % do CoinGecko como proxy para performance
    try {
        console.log('📊 Calculando Altseason Index...');
        
        // Aguardar para evitar rate limit
        await new Promise(r => setTimeout(r, 1000));
        
        // Buscar Top 100 coins com dados de ATH
        const coinsRes = await fetch(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false'
        );
        
        if (coinsRes.ok) {
            const coins = await coinsRes.json();
            
            // Encontrar BTC
            const btc = coins.find(c => c.id === 'bitcoin');
            if (!btc) throw new Error('BTC não encontrado');
            
            const btcAthChange = btc.ath_change_percentage || 0;
            console.log('   BTC ATH %:', btcAthChange.toFixed(2) + '%');
            
            // Filtrar altcoins (excluir BTC, stablecoins, wrapped tokens)
            const excluded = [
                'bitcoin', 'tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd', 
                'pax-dollar', 'first-digital-usd', 'ethena-usde', 'usds',
                'wrapped-bitcoin', 'steth', 'weth', 'wrapped-steth', 'cbeth',
                'rocket-pool-eth', 'frax-ether', 'coinbase-wrapped-btc', 'leo-token',
                'multi-collateral-dai'
            ];
            
            const altcoins = coins.filter(c => !excluded.includes(c.id)).slice(0, 50);
            
            // Contar altcoins mais próximas do ATH que BTC (melhor performance)
            let outperformCount = 0;
            altcoins.forEach(coin => {
                const altAthChange = coin.ath_change_percentage || -100;
                if (altAthChange > btcAthChange) {
                    outperformCount++;
                }
            });
            
            // Combinar ATH ratio com inverse de BTC dominance
            const rawRatio = outperformCount / altcoins.length;
            const btcDomFactor = (100 - result.btcDominance) / 100;
            
            // Fórmula: 40% ATH ratio + 60% inverse dominance
            const combinedScore = (rawRatio * 40) + (btcDomFactor * 60);
            result.altseasonIndex = Math.round(combinedScore);
            result.altseasonIndex = Math.min(100, Math.max(0, result.altseasonIndex));
            
            console.log(`   Altcoins > BTC ATH: ${outperformCount}/${altcoins.length}`);
            console.log(`   BTC.D factor: ${(btcDomFactor * 100).toFixed(1)}%`);
            console.log(`✅ Altseason Index: ${result.altseasonIndex}`);
        } else {
            // Fallback baseado em dominância
            if (result.btcDominance) {
                result.altseasonIndex = Math.round(100 - (result.btcDominance * 1.4));
                result.altseasonIndex = Math.min(100, Math.max(0, result.altseasonIndex));
                console.log('⚠️ Altseason (fallback):', result.altseasonIndex);
            }
        }
    } catch (e) {
        console.error('❌ Erro ao calcular Altseason:', e.message);
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
