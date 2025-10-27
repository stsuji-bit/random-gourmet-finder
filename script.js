// グローバル変数
let currentLocation = null;
let apiKey = 'f2cac3377d49d495'; // ホットペッパーグルメAPIのキーを設定してください

// DOM要素の取得
const locationStatus = document.getElementById('locationStatus');
const searchButton = document.getElementById('searchButton');
const searchForm = document.getElementById('searchForm');
const resultsContainer = document.getElementById('resultsContainer');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// アプリの初期化
function initializeApp() {
    // 位置情報の取得を試行
    getCurrentLocation();
    
    // フォームの送信イベントを設定
    searchForm.addEventListener('submit', handleSearch);
}

// 現在地の取得
function getCurrentLocation() {
    updateLocationStatus('位置情報の取得を開始しています...', 'loading');
    
    if (!navigator.geolocation) {
        updateLocationStatus('このブラウザは位置情報をサポートしていません。', 'error');
        return;
    }
    
    const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5分間キャッシュ
    };
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            
            updateLocationStatus(
                `現在地を取得しました (緯度: ${currentLocation.lat.toFixed(6)}, 経度: ${currentLocation.lng.toFixed(6)})`,
                'success'
            );
            
            // 検索ボタンを有効化
            searchButton.disabled = false;
        },
        function(error) {
            let errorMsg = '';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = '位置情報の取得が拒否されました。ブラウザの設定で位置情報を許可してください。';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = '位置情報が利用できません。';
                    break;
                case error.TIMEOUT:
                    errorMsg = '位置情報の取得がタイムアウトしました。';
                    break;
                default:
                    errorMsg = '位置情報の取得中にエラーが発生しました。';
                    break;
            }
            
            updateLocationStatus(errorMsg, 'error');
        },
        options
    );
}

// 位置情報ステータスの更新
function updateLocationStatus(message, type) {
    const statusElement = locationStatus.querySelector('.status-text');
    statusElement.textContent = message;
    
    // クラスのリセット
    locationStatus.className = 'location-status';
    
    // タイプに応じたクラスを追加
    if (type === 'success') {
        locationStatus.classList.add('status-success');
    } else if (type === 'error') {
        locationStatus.classList.add('status-error');
    }
}

// 検索処理
async function handleSearch(event) {
    event.preventDefault();
    
    if (!currentLocation) {
        showError('位置情報が取得できていません。ページを再読み込みしてください。');
        return;
    }
    
    // ローディング表示
    showLoading(true);
    hideError();
    
    try {
        // フォームデータの取得
        const formData = new FormData(searchForm);
        const minBudget = parseInt(formData.get('minBudget')) || 0;
        const maxBudget = parseInt(formData.get('maxBudget')) || 99999;
        
        // 予算コードの自動決定
        const budgetCode = determineBudgetCode(minBudget, maxBudget);
        
        const searchParams = {
            keyword: formData.get('keyword') || '',
            budget: budgetCode,
            minBudget: minBudget,
            maxBudget: maxBudget,
            range: formData.get('range') || '3',
            timeSlot: formData.get('timeSlot') || 'dinner'
        };
        
        console.log('💰 予算設定:', { minBudget, maxBudget, budgetCode });
        
        // API呼び出し
        const restaurants = await searchRestaurants(searchParams);
        
        // 結果の表示
        displayResults(restaurants);
        
    } catch (error) {
        console.error('検索エラー:', error);
        showError('お店の検索中にエラーが発生しました。しばらく時間をおいて再度お試しください。');
    } finally {
        showLoading(false);
    }
}

// 予算コードの自動決定関数
function determineBudgetCode(minBudget, maxBudget) {
    // ホットペッパーグルメAPIの予算コード定義
    const budgetCodes = [
        { code: 'B001', min: 0, max: 500, name: '～500円' },
        { code: 'B002', min: 500, max: 1000, name: '500円～1000円' },
        { code: 'B003', min: 1000, max: 1500, name: '1000円～1500円' },
        { code: 'B004', min: 1500, max: 2000, name: '1500円～2000円' },
        { code: 'B005', min: 2000, max: 3000, name: '2000円～3000円' },
        { code: 'B006', min: 3000, max: 4000, name: '3000円～4000円' },
        { code: 'B007', min: 4000, max: 5000, name: '4000円～5000円' },
        { code: 'B008', min: 5000, max: 99999, name: '5000円～' }
    ];
    
    // 指定なしの場合は空文字を返す
    if (minBudget === 0 && maxBudget === 99999) {
        console.log('💰 予算指定なし');
        return '';
    }
    
    // ユーザーの指定範囲を含む最も広い予算コードを探す
    let bestMatch = null;
    let maxCoverage = 0;
    
    for (const budgetCode of budgetCodes) {
        // ユーザーの指定範囲と予算コードの範囲の重複を計算
        const overlapMin = Math.max(minBudget, budgetCode.min);
        const overlapMax = Math.min(maxBudget, budgetCode.max);
        
        if (overlapMin <= overlapMax) {
            // 重複がある場合、その範囲の広さを計算
            const coverage = overlapMax - overlapMin;
            
            // 最も広い範囲をカバーする予算コードを選択
            if (coverage > maxCoverage) {
                maxCoverage = coverage;
                bestMatch = budgetCode;
            }
        }
    }
    
    // 最も広くカバーする予算コードを返す（見つからない場合は最も広い範囲のコード）
    if (bestMatch) {
        console.log('💰 選択された予算コード:', bestMatch.code, '-', bestMatch.name);
        return bestMatch.code;
    } else {
        // 見つからない場合は最も広い範囲のコードを返す
        const widestCode = budgetCodes[budgetCodes.length - 1];
        console.log('💰 予算コードが見つからないため、最も広い範囲を使用:', widestCode.code);
        return widestCode.code;
    }
}

// ホットペッパーグルメAPIでレストラン検索（AllOriginsプロキシ経由）
async function searchRestaurants(params) {
    const baseUrl = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/';
    
    // APIパラメータの構築
    const maxCount = 100; // APIの最大取得件数
    const apiParams = new URLSearchParams({
        key: apiKey,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        range: params.range,
        count: maxCount, // 最大件数で取得してランダム選択
        format: 'json'
    });
    
    // 安全なstartパラメータの計算（まず全件数を取得してから計算）
    // 最初はstart=1で全件数を取得
    apiParams.append('start', 1);
    
    // オプションパラメータの追加
    if (params.keyword) {
        apiParams.append('keyword', params.keyword);
    }
    
    if (params.budget) {
        apiParams.append('budget', params.budget);
    }
    
    // ランチ営業店に絞り込むパラメータ
    if (params.timeSlot === 'lunch') {
        apiParams.append('lunch', '1');
    }
    
    // キャッシュ無効化パラメータを追加（現在時刻のミリ秒をランダム値として使用）
    const timestamp = Date.now();
    apiParams.append('timestamp', timestamp);
    
    // ホットペッパーAPIの完全なURL
    const hotpepperUrl = `${baseUrl}?${apiParams.toString()}`;
    
    // CORS Anywhereプロキシ経由のURL
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(hotpepperUrl)}`;
    
    // デバッグ用：APIキーとリクエストURLをコンソールに出力
    console.log('🔑 APIキー:', apiKey);
    console.log('🌐 ホットペッパーAPI URL:', hotpepperUrl);
    console.log('🔄 CORS AnywhereプロキシURL:', proxyUrl);
    console.log('📋 APIパラメータ:', Object.fromEntries(apiParams));
    
    try {
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // CORS Anywhereプロキシ経由で直接APIレスポンスを取得
        const apiResponse = await response.json();
        console.log('📋 CORS Anywhere経由で取得したAPIレスポンス:', apiResponse);
        
        // エラーチェック
        if (apiResponse.results.error) {
            throw new Error(apiResponse.results.error[0].message);
        }
        
        // 全件数を取得（最大1000件に制限）
        let totalAvailable = apiResponse.results.results_available || 0;
        const MAX_TOTAL_AVAILABLE = 1000; // Hot Pepper APIの制限を考慮
        if (totalAvailable > MAX_TOTAL_AVAILABLE) {
            console.log(`📊 API全件数: ${totalAvailable} → ${MAX_TOTAL_AVAILABLE}に制限`);
            totalAvailable = MAX_TOTAL_AVAILABLE;
        } else {
            console.log('📊 API全件数:', totalAvailable);
        }
        
        let restaurants = apiResponse.results.shop || [];
        
        // 全件数が取得件数より多い場合、ランダムなstart位置で再リクエスト
        if (totalAvailable > maxCount) {
            console.log('🎲 全件数が取得件数より多いため、ランダムなstart位置で再リクエスト');
            
            // start位置のランダム化: 1から(総件数-3)の間のランダムな整数値
            // 最後の3件まで確実に取得できるようにする
            const maxStartPosition = Math.max(1, totalAvailable - 3);
            const randomStart = Math.floor(Math.random() * maxStartPosition) + 1;
            
            console.log('🎲 ランダム開始位置:', randomStart, '(範囲: 1～', maxStartPosition, ', 全件数:', totalAvailable, ')');
            
            // 新しいAPIパラメータで再リクエスト
            const newApiParams = new URLSearchParams({
                key: apiKey,
                lat: currentLocation.lat,
                lng: currentLocation.lng,
                range: params.range,
                count: maxCount,
                format: 'json',
                start: randomStart
            });
            
            // オプションパラメータの追加
            if (params.keyword) {
                newApiParams.append('keyword', params.keyword);
            }
            if (params.budget) {
                newApiParams.append('budget', params.budget);
            }
            if (params.timeSlot === 'lunch') {
                newApiParams.append('lunch', '1');
            }
            
            // キャッシュ無効化パラメータを追加（再リクエスト時も新しいタイムスタンプ）
            const newTimestamp = Date.now();
            newApiParams.append('timestamp', newTimestamp);
            
            const newHotpepperUrl = `${baseUrl}?${newApiParams.toString()}`;
            const newProxyUrl = `https://corsproxy.io/?${encodeURIComponent(newHotpepperUrl)}`;
            
            console.log('🔄 再リクエストURL:', newProxyUrl);
            
            const newResponse = await fetch(newProxyUrl);
            if (!newResponse.ok) {
                throw new Error(`HTTP error! status: ${newResponse.status}`);
            }
            
            const newApiResponse = await newResponse.json();
            
            if (newApiResponse.results.error) {
                throw new Error(newApiResponse.results.error[0].message);
            }
            
            restaurants = newApiResponse.results.shop || [];
            console.log('📋 再リクエスト結果:', restaurants.length, '件取得');
        }
        
        if (restaurants.length === 0) {
            throw new Error('指定した条件でお店が見つかりませんでした。');
        }
        
        // 予算コードと営業時間でフィルタリング
        const filteredRestaurants = filterRestaurants(restaurants, params);
        
        if (filteredRestaurants.length === 0) {
            throw new Error('指定した条件（予算・営業時間）に合うお店が見つかりませんでした。');
        }
        
        // ランダムに3件選択
        return getRandomRestaurants(filteredRestaurants, 3);
        
    } catch (error) {
        console.error('API呼び出しエラー:', error);
        throw error;
    }
}


// レストランのフィルタリング（予算コードと営業時間）
function filterRestaurants(restaurants, params) {
    let filtered = [...restaurants];
    
    console.log('🔍 フィルタリング開始:', { 
        totalRestaurants: restaurants.length, 
        params: params 
    });
    
    // 時間帯の決定：フォームから取得したtimeSlotの値をselectedTimeとして使用
    const timeSlotSelect = document.getElementById('timeSlot');
    const selectedTime = timeSlotSelect ? timeSlotSelect.value : 'dinner';
    
    console.log('🎯 選択された時間帯:', selectedTime);
    
    // 予算コードでフィルタリング
    if (params.budget) {
        console.log('💰 予算フィルタリング:', params.budget);

        filtered = filtered.filter(restaurant => {
            let budgetMatch = true; // デフォルトは通過

            if (selectedTime === 'lunch') {
                // ランチ：データがある場合のみ厳密一致、無い場合は除外しない
                if (restaurant.lunch && (restaurant.lunch.code || restaurant.lunch.average)) {
                    if (restaurant.lunch.code) {
                        budgetMatch = restaurant.lunch.code === params.budget;
                        console.log(`🍽️ ランチ予算チェック: ${restaurant.name} - ${restaurant.lunch.code} === ${params.budget} = ${budgetMatch}`);
                    } else {
                        // averageのみある場合は通過（範囲比較実装がないため）
                        budgetMatch = true;
                        console.log(`🍽️ ランチ平均予算のみ存在: ${restaurant.name} - ${restaurant.lunch.average}`);
                    }
                } else {
                    // ランチ予算情報が無い→緩和して通過
                    budgetMatch = true;
                    console.log(`🍽️ ランチ予算情報なし（緩和通過）: ${restaurant.name}`);
                }
            } else {
                // ディナー：従来通りコード一致
                if (restaurant.budget && restaurant.budget.code) {
                    budgetMatch = restaurant.budget.code === params.budget;
                    console.log(`🍽️ ディナー予算チェック: ${restaurant.name} - ${restaurant.budget.code} === ${params.budget} = ${budgetMatch}`);
                } else {
                    budgetMatch = false;
                    console.log(`🍽️ ディナー予算情報なし: ${restaurant.name}`);
                }
            }

            return budgetMatch;
        });

        console.log('💰 予算コードフィルタリング後:', filtered.length);
    }
    
    // 厳密な予算フィルタリング（minBudget/maxBudgetによる絞り込み）
    if (params.minBudget !== undefined && params.maxBudget !== undefined) {
        const minBudget = parseInt(params.minBudget) || 0;
        const maxBudget = parseInt(params.maxBudget) || 99999;
        
        // 指定なしの場合はスキップ
        if (minBudget !== 0 || maxBudget !== 99999) {
            console.log('💰 厳密な予算フィルタリング:', { minBudget, maxBudget });
            
            filtered = filtered.filter(restaurant => {
                let averageBudget = null;
                
                // 時間帯に基づいて平均金額を取得
                if (selectedTime === 'lunch') {
                    // ランチの場合：ランチ平均金額を使用
                    if (restaurant.lunch && restaurant.lunch.average) {
                        averageBudget = parseInt(restaurant.lunch.average);
                    }
                } else {
                    // ディナーの場合：ディナー平均金額を使用
                    if (restaurant.budget && restaurant.budget.average) {
                        averageBudget = parseInt(restaurant.budget.average);
                    }
                }
                
                // 平均金額が取得できない場合はスキップ（除外しない）
                if (averageBudget === null || isNaN(averageBudget)) {
                    console.log(`💰 予算情報なし（スキップ）: ${restaurant.name}`);
                    return true; // 情報がない場合は通過
                }
                
                // 厳密な範囲チェック
                const inRange = averageBudget >= minBudget && averageBudget <= maxBudget;
                console.log(`💰 厳密予算チェック: ${restaurant.name} - ${averageBudget}円 (範囲: ${minBudget}～${maxBudget}) = ${inRange}`);
                
                return inRange;
            });
            
            console.log('💰 厳密な予算フィルタリング後:', filtered.length);
        }
    }
    
    // 現在営業中の店舗のみをフィルタリング
    filtered = filtered.filter(restaurant => {
        let isOpen = isCurrentlyOpen(restaurant);
        
        // ランチ検索時の緩和: これから1時間以内に開店する店舗も通過させる
        if (!isOpen && selectedTime === 'lunch') {
            const willOpenSoon = isOpeningWithinOneHour(restaurant);
            if (willOpenSoon) {
                console.log(`🍽️ ランチ検索緩和: ${restaurant.name} - 1時間以内に開店予定`);
                isOpen = true;
            }
        }
        
        console.log(`🕐 営業時間チェック: ${restaurant.name} - ${isOpen ? '営業中' : '営業時間外'}`);
        return isOpen;
    });
    
    console.log('🕐 営業時間フィルタリング後:', filtered.length);
    console.log('✅ 最終フィルタリング結果:', filtered.length);
    
    return filtered;
}

// これから1時間以内に開店するかどうかを判定
function isOpeningWithinOneHour(restaurant) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 100 + currentMinute; // HHMM形式
    
    const openTime = restaurant.open;
    
    if (!openTime) {
        return false; // 営業時間情報がない場合は判定不能
    }
    
    try {
        // 営業時間の形式を解析（例: "11:00～23:00" または "11:00-23:00"）
        const timeMatch = openTime.match(/(\d{1,2}):(\d{2})[～-](\d{1,2}):(\d{2})/);
        if (timeMatch) {
            const openHour = parseInt(timeMatch[1]);
            const openMinute = parseInt(timeMatch[2]);
            const openTimeMinutes = openHour * 100 + openMinute;
            
            // 現在時刻から開店時刻までの時間差を計算（分単位）
            const currentTotalMinutes = currentHour * 60 + currentMinute;
            const openTotalMinutes = openHour * 60 + openMinute;
            
            let minutesUntilOpen;
            if (openTotalMinutes >= currentTotalMinutes) {
                // 今日中に開店する場合
                minutesUntilOpen = openTotalMinutes - currentTotalMinutes;
            } else {
                // 翌日に開店する場合（24時間跨ぎ）
                minutesUntilOpen = (24 * 60) - currentTotalMinutes + openTotalMinutes;
            }
            
            // 1時間以内（60分以内）に開店するかチェック
            const willOpenSoon = minutesUntilOpen > 0 && minutesUntilOpen <= 60;
            
            console.log(`   🕐 開店予定チェック: ${restaurant.name} - 現在: ${currentHour}:${String(currentMinute).padStart(2, '0')}, 開店: ${openHour}:${String(openMinute).padStart(2, '0')}, 残り${minutesUntilOpen}分, 緩和適用: ${willOpenSoon}`);
            
            return willOpenSoon;
        }
        
        return false;
    } catch (error) {
        console.warn(`   ⚠️ 開店予定の解析に失敗:`, openTime, error);
        return false;
    }
}

// 現在営業中かどうかを判定
function isCurrentlyOpen(restaurant) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 100 + currentMinute; // HHMM形式
    
    // 曜日の取得（0=日曜日, 1=月曜日, ...）
    const dayOfWeek = now.getDay();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const currentDayName = dayNames[dayOfWeek];
    
    // 現在時刻の表示
    const currentTimeString = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    
    // XMLレスポンスの営業時間フィールド（openタグ）
    const openTime = restaurant.open;
    
    console.log(`🕐 [${restaurant.name}] 営業時間チェック開始`);
    console.log(`   📅 現在の曜日と時刻: ${currentDayName}曜日 ${currentTimeString} (${currentTime})`);
    console.log(`   📋 営業時間データ: "${openTime}"`);
    console.log(`   🔍 営業時間フィールド全体:`, restaurant);
    
    if (!openTime) {
        console.log(`   ✅ 営業時間情報なし → 営業中とみなす`);
        return true; // 営業時間情報がない場合は営業中とみなす
    }
    
    try {
        // 営業時間の形式を解析（例: "11:00～23:00" または "11:00-23:00"）
        const timeMatch = openTime.match(/(\d{1,2}):(\d{2})[～-](\d{1,2}):(\d{2})/);
        if (timeMatch) {
            const openHour = parseInt(timeMatch[1]);
            const openMinute = parseInt(timeMatch[2]);
            const closeHour = parseInt(timeMatch[3]);
            const closeMinute = parseInt(timeMatch[4]);
            
            const openTimeMinutes = openHour * 100 + openMinute;
            const closeTimeMinutes = closeHour * 100 + closeMinute;
            
            console.log(`   🔍 解析結果: 開店 ${openHour}:${String(openMinute).padStart(2, '0')} (${openTimeMinutes}) ～ 閉店 ${closeHour}:${String(closeMinute).padStart(2, '0')} (${closeTimeMinutes})`);
            
            let isOpen = false;
            
            // 24時間を跨ぐ場合の処理
            if (closeTimeMinutes < openTimeMinutes) {
                isOpen = currentTime >= openTimeMinutes || currentTime <= closeTimeMinutes;
                console.log(`   🌙 24時間跨ぎ営業: ${currentTime} >= ${openTimeMinutes} || ${currentTime} <= ${closeTimeMinutes} = ${isOpen}`);
            } else {
                isOpen = currentTime >= openTimeMinutes && currentTime <= closeTimeMinutes;
                console.log(`   📊 通常営業: ${currentTime} >= ${openTimeMinutes} && ${currentTime} <= ${closeTimeMinutes} = ${isOpen}`);
            }
            
            console.log(`   ${isOpen ? '✅' : '❌'} 判定結果: ${isOpen ? '営業中' : '営業時間外'}`);
            return isOpen;
        }
        
        // その他の形式の場合は営業中とみなす
        console.log(`   ⚠️ 営業時間の形式が認識できませんでした → 営業中とみなす`);
        return true;
    } catch (error) {
        console.warn(`   ⚠️ 営業時間の解析に失敗:`, openTime, error);
        return true; // 解析に失敗した場合は営業中とみなす
    }
}

// ランダムにレストランを選択（重複防止・完全ランダム）
function getRandomRestaurants(restaurants, count) {
    console.log('🎲 ランダム抽出開始:', { 
        totalRestaurants: restaurants.length, 
        requestedCount: count 
    });
    
    // リストが少ない場合の処理：取得できた全てのお店をそのまま返す
    if (restaurants.length <= count) {
        console.log('📝 店舗数が要求数以下、全件返却:', restaurants.length);
        return restaurants;
    }
    
    // Fisher-Yatesシャッフルアルゴリズムを使用して完全ランダム化
    const shuffled = [...restaurants];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // 重複防止：最初のcount件を取得（既にシャッフル済みなので重複なし）
    const selected = shuffled.slice(0, count);
    
    console.log('🎲 ランダム抽出完了:', {
        selectedCount: selected.length,
        selectedNames: selected.map(r => r.name)
    });
    
    return selected;
}

// アクセス情報を解析して駅名と徒歩時間を抽出
function parseAccessInfo(restaurant) {
    // アクセス情報のフィールドを確認（複数の可能性を試行）
    const accessInfo = restaurant.mobile_access || restaurant.access || restaurant.walk;
    
    if (!accessInfo) {
        return 'アクセス情報なし';
    }
    
    // 正規表現で駅名と徒歩時間を抽出
    // パターン1: 「(駅名)より徒歩(X分)」
    // パターン2: 「(駅名)から徒歩(X分)」
    const patterns = [
        /(.+?)より徒歩(\d+)分/,
        /(.+?)から徒歩(\d+)分/,
        /(.+?)駅より徒歩(\d+)分/,
        /(.+?)駅から徒歩(\d+)分/
    ];
    
    for (const pattern of patterns) {
        const match = accessInfo.match(pattern);
        if (match) {
            const stationName = match[1].trim();
            const walkTime = match[2];
            return `${stationName}から徒歩${walkTime}分`;
        }
    }
    
    // パターンにマッチしない場合は元の情報をそのまま表示
    return accessInfo;
}

// 予算情報を取得（ランチ/ディナー対応）
function getBudgetInfo(restaurant, selectedTime) {
    console.log('🔍 予算情報取得:', { restaurant, selectedTime });

    // ヘルパー: ディナー予算テキスト（必要なら注釈を付与）
    const buildDinnerText = (text) => `${text} (夜の目安)`;

    if (selectedTime === 'lunch') {
        // ランチ：まずランチ予算を優先
        if (restaurant.lunch && restaurant.lunch.average) {
            console.log('🍽️ ランチ平均予算:', restaurant.lunch.average);
            return `平均: ${restaurant.lunch.average}円`;
        }
        if (restaurant.lunch && restaurant.lunch.code) {
            console.log('🍽️ ランチ予算コード:', restaurant.lunch.code);
            return `予算: ${restaurant.lunch.code}`;
        }
        if (restaurant.lunch && restaurant.lunch.name) {
            console.log('🍽️ ランチ予算名:', restaurant.lunch.name);
            return restaurant.lunch.name;
        }

        // ランチ情報が無い場合はディナー予算を代替表示（注釈付き）
        if (restaurant.budget && restaurant.budget.average) {
            const text = `平均: ${restaurant.budget.average}円`;
            console.log('🌙 代替ディナー平均予算:', text);
            return buildDinnerText(text);
        }
        if (restaurant.budget && restaurant.budget.code) {
            const text = `予算: ${restaurant.budget.code}`;
            console.log('🌙 代替ディナー予算コード:', text);
            return buildDinnerText(text);
        }
        if (restaurant.budget && restaurant.budget.name) {
            const text = restaurant.budget.name;
            console.log('🌙 代替ディナー予算名:', text);
            return buildDinnerText(text);
        }
    } else {
        // ディナー：そのままディナー予算
        if (restaurant.budget && restaurant.budget.average) {
            console.log('🍽️ ディナー平均予算:', restaurant.budget.average);
            return `平均: ${restaurant.budget.average}円`;
        }
        if (restaurant.budget && restaurant.budget.code) {
            console.log('🍽️ ディナー予算コード:', restaurant.budget.code);
            return `予算: ${restaurant.budget.code}`;
        }
        if (restaurant.budget && restaurant.budget.name) {
            console.log('🍽️ ディナー予算名:', restaurant.budget.name);
            return restaurant.budget.name;
        }
    }

    console.log('⚠️ 予算情報が見つかりません');
    return '（情報なし）';
}

// 結果の表示
function displayResults(restaurants) {
    if (restaurants.length === 0) {
        resultsContainer.innerHTML = `
            <div class="no-results">
                <p>指定した条件でお店が見つかりませんでした。</p>
                <p>検索条件を変更してお試しください。</p>
            </div>
        `;
        return;
    }
    
    // 時間帯の決定：フォームから取得したtimeSlotの値をselectedTimeとして使用
    const timeSlotSelect = document.getElementById('timeSlot');
    const selectedTime = timeSlotSelect ? timeSlotSelect.value : 'dinner';
    
    console.log('🎯 選択された時間帯:', selectedTime);
    console.log('🏪 表示するレストラン数:', restaurants.length);
    
    const resultsHTML = restaurants.map((restaurant, index) => {
        const accessInfo = parseAccessInfo(restaurant);
        const budgetInfo = getBudgetInfo(restaurant, selectedTime);
        
        // ホットペッパーグルメの店舗ページURLを取得
        const shopUrl = restaurant.urls?.pc || restaurant.urls?.sp || restaurant.url || '';
        
        console.log(`🏪 レストラン${index + 1}:`, {
            name: restaurant.name,
            selectedTime: selectedTime,
            budgetInfo: budgetInfo,
            shopUrl: shopUrl,
            restaurantData: restaurant
        });
        
        // 店舗名をリンクにする（URLがある場合）
        const restaurantNameHTML = shopUrl 
            ? `<a href="${shopUrl}" target="_blank" rel="noopener noreferrer" class="restaurant-link">${restaurant.name}</a>`
            : restaurant.name;
        
        return `
        <div class="restaurant-card">
            <div class="restaurant-name">${restaurantNameHTML}</div>
            <div class="restaurant-info">
                <div class="info-item">
                    <span>📍</span>
                    <span>${restaurant.address}</span>
                </div>
                <div class="info-item">
                    <span>💰</span>
                    <span>${budgetInfo}</span>
                </div>
                <div class="info-item">
                    <span>🚶</span>
                    <span>${accessInfo}</span>
                </div>
                <div class="info-item">
                    <span>🍽️</span>
                    <span>${restaurant.genre.name}</span>
                </div>
            </div>
            <div class="restaurant-description">
                ${restaurant.catch || '詳細情報はありません。'}
            </div>
        </div>
        `;
    }).join('');
    
    resultsContainer.innerHTML = resultsHTML;
}

// ローディング表示の制御
function showLoading(show) {
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

// エラーメッセージの表示
function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
}

// エラーメッセージの非表示
function hideError() {
    errorMessage.classList.add('hidden');
}

// デバッグ用：APIキーの設定確認
function checkApiKey() {
    if (apiKey === 'YOUR_API_KEY_HERE') {
        console.warn('⚠️ APIキーが設定されていません。ホットペッパーグルメAPIのキーを設定してください。');
        console.log('APIキーの取得方法: https://webservice.recruit.co.jp/');
    }
}

// ページ読み込み時にAPIキーをチェック
checkApiKey();
