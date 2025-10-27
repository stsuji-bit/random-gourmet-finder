// グローバル変数
let currentLocation = null;

// DOM要素の変数（後で初期化）
let locationStatus, searchButton, searchForm, resultsContainer, loading, errorMessage, errorText;

// Google Maps APIの読み込み完了時のコールバック
// この関数はGoogle Maps APIが読み込まれる前に定義される必要がある
// グローバルスコープで直接定義することで、callbackパラメータから呼び出せるようにする
function initGoogleMaps() {
    console.log('✅ Google Maps JavaScript APIが読み込まれました');
    
    // DOM要素の取得（DOMContentLoadedが完了していることを確認）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializeDOMElements();
            checkGoogleMapsAPI();
            initializeApp();
        });
    } else {
        // DOMContentLoadedが既に完了している場合
        initializeDOMElements();
        checkGoogleMapsAPI();
        initializeApp();
    }
}

// DOM要素の初期化
function initializeDOMElements() {
    locationStatus = document.getElementById('locationStatus');
    searchButton = document.getElementById('searchButton');
    searchForm = document.getElementById('searchForm');
    resultsContainer = document.getElementById('resultsContainer');
    loading = document.getElementById('loading');
    errorMessage = document.getElementById('errorMessage');
    errorText = document.getElementById('errorText');
}

// ページ読み込み時の初期化（APIがすでに読み込まれている場合のフォールバック）
document.addEventListener('DOMContentLoaded', function() {
    // DOM要素の初期化
    initializeDOMElements();
    
    // Google Maps APIがすでに読み込まれている場合のフォールバック
    setTimeout(() => {
        if (typeof google !== 'undefined' && google.maps && google.maps.places) {
            // APIがすでに読み込まれていて、initGoogleMapsが呼ばれていない場合
            if (!currentLocation && typeof window.initGoogleMaps === 'function') {
                console.log('🔄 Google Maps APIは読み込まれていますが、コールバックが呼ばれていません。手動で初期化します。');
                checkGoogleMapsAPI();
    initializeApp();
            }
        }
    }, 2000);
});

// アプリの初期化
function initializeApp() {
    // DOM要素が初期化されていることを確認
    if (!locationStatus || !searchButton || !searchForm || !resultsContainer || !loading || !errorMessage || !errorText) {
        console.warn('⚠️ DOM要素が初期化されていません。再試行します...');
        initializeDOMElements();
    }
    
    // 位置情報の取得を試行
    getCurrentLocation();
    
    // フォームの送信イベントを設定
    if (searchForm) {
    searchForm.addEventListener('submit', handleSearch);
    }
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
        
        // 予算をGoogle Maps価格レベルに変換
        const priceLevel = convertBudgetToPriceLevel(minBudget, maxBudget);
        
        const searchParams = {
            keyword: formData.get('keyword') || '',
            minBudget: minBudget,
            maxBudget: maxBudget,
            minprice: priceLevel.minprice,
            maxprice: priceLevel.maxprice,
            range: formData.get('range') || '3',
            timeSlot: formData.get('timeSlot') || 'dinner'
        };
        
        console.log('💰 予算設定:', { minBudget, maxBudget, priceLevel });
        
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

// 予算金額をGoogle Maps価格レベルに変換（0～4）
function convertBudgetToPriceLevel(minBudget, maxBudget) {
    // Google Maps Places APIの価格レベル:
    // 0: 最も安い（～1000円）
    // 1: 安い（1000～2000円）
    // 2: 中程度（2000～4000円）
    // 3: 高い（4000～6000円）
    // 4: 最も高い（6000円～）
    
    // 指定なしの場合はnullを返す
    if (minBudget === 0 && maxBudget === 99999) {
        console.log('💰 予算指定なし');
        return { minprice: null, maxprice: null };
    }
    
    // 平均予算を計算
    const avgBudget = (minBudget + maxBudget) / 2;
    
    let minprice, maxprice;
    
    if (avgBudget <= 1000) {
        minprice = 0;
        maxprice = 1;
    } else if (avgBudget <= 2000) {
        minprice = 0;
        maxprice = 2;
    } else if (avgBudget <= 4000) {
        minprice = 1;
        maxprice = 3;
    } else if (avgBudget <= 6000) {
        minprice = 2;
        maxprice = 4;
    } else {
        minprice = 3;
        maxprice = 4;
    }
    
    console.log('💰 予算変換:', { minBudget, maxBudget, avgBudget, minprice, maxprice });
    
    return { minprice, maxprice };
}

// Google Maps Places APIの結果をアプリの形式に変換
function convertPlacesToRestaurants(places) {
    return places.map(place => ({
        name: place.name,
        address: place.vicinity || '',
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        place_id: place.place_id || '', // Google Mapリンク用のplace_idを取得
        rating: place.rating || 0,
        price_level: place.price_level !== undefined ? place.price_level : null,
        open: place.opening_hours ? 
            (place.opening_hours.open_now ? '営業中' : '営業時間外') : '',
        // 営業時間情報を保存（ランチフィルタリング用）
        opening_hours: place.opening_hours || null,
        weekday_text: place.opening_hours && place.opening_hours.weekday_text ? 
            place.opening_hours.weekday_text : [],
        // 店舗タイプを保存（ランチフィルタリング用）
        types: place.types || [],
        url: place.url || '',
        urls: {
            pc: place.url || '',
            sp: place.url || ''
        },
        genre: {
            name: place.types && place.types.length > 0 ? place.types[0] : '飲食店'
        },
        catch: place.name,
        walk: '',
        budget: {
            code: place.price_level !== undefined ? `B00${place.price_level + 1}` : '',
            name: place.price_level !== undefined ? 
                ['～500円', '500円～1000円', '1000円～1500円', '1500円～2000円', '2000円～'][place.price_level] : '',
            average: null
        },
        lunch: {
            code: '',
            name: '',
            average: null
        }
    }));
}

// Google Maps Places API (Nearby Search) でレストラン検索
async function searchRestaurants(params) {
    return new Promise((resolve, reject) => {
        // Google Maps JavaScript APIが読み込まれているか確認
        if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
            reject(new Error('Google Maps JavaScript APIが読み込まれていません。ページを再読み込みしてください。'));
            return;
        }
        
        // 距離をメートルに変換
        const rangeMap = {
            '1': 300,   // 300m
            '2': 500,   // 500m
            '3': 1000,  // 1km
            '4': 2000,  // 2km
            '5': 3000   // 3km
        };
        const radius = rangeMap[params.range] || 1000;
        
        // 現在位置オブジェクトを作成
        const location = new google.maps.LatLng(currentLocation.lat, currentLocation.lng);
        
        // PlacesServiceリクエストの設定
        const request = {
            location: location,
            radius: radius,
            type: 'restaurant'
        };
        
        // キーワードの追加
        if (params.keyword && params.keyword.trim()) {
            request.keyword = params.keyword.trim();
        }
        
        // 価格レベルの追加（Google Maps APIの正しいパラメータ名を使用）
        if (params.minprice !== null && params.minprice !== undefined) {
            request.minPriceLevel = params.minprice;
        }
        if (params.maxprice !== null && params.maxprice !== undefined) {
            request.maxPriceLevel = params.maxprice;
        }
        
        // 営業中フィルタは無効化（すべての店舗を対象とする）
        // request.openNow = true; // 削除されました
        
        console.log('🌐 Google Maps Places API リクエスト:', request);
        
        // PlacesServiceの作成（非表示のdiv要素を使用）
        const service = new google.maps.places.PlacesService(document.createElement('div'));
        
        // すべての検索結果を保存する配列
        let allRestaurants = [];
        let currentPage = 1;
        
        // コールバック関数を定義（ページネーションに対応）
        const searchCallback = (results, status, pagination) => {
            console.log(`📋 Google Maps Places API ステータス（${currentPage}ページ目）:`, status);
            
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                console.log(`📋 Google Maps Places APIレスポンス（${currentPage}ページ目）:`, results);
                
                if (!results || results.length === 0) {
                    if (currentPage === 1) {
                        reject(new Error('指定した条件でお店が見つかりませんでした。検索範囲を広げるか、条件を変更してお試しください。'));
                    } else {
                        console.warn('⚠️ 2ページ目が空でした。1ページ目の結果のみを使用します。');
                        processAndResolve(allRestaurants, params, resolve, reject);
                    }
                    return;
                }
                
                // 現在のページの結果を変換して配列に追加
                const pageRestaurants = convertPlacesToRestaurants(results);
                allRestaurants = allRestaurants.concat(pageRestaurants);
                console.log(`🏪 ${currentPage}ページ目のレストラン:`, pageRestaurants.length, '件');
                
                // next_page_tokenがあるかチェック（Google Maps JavaScript APIではpagination.hasNextPageを使用）
                if (pagination && pagination.hasNextPage && currentPage === 1) {
                    console.log('📄 次のページが存在します。2ページ目を取得します...');
                    currentPage = 2;
                    
                    // next_page_tokenが有効になるまで少し待つ（APIの仕様）
                    setTimeout(() => {
                        // 2回目のリクエストを実行（pagination.nextPage()を呼び出すと同じコールバックが再度呼ばれる）
                        pagination.nextPage();
                    }, 1000); // 1秒待機（next_page_tokenが有効になるまで）
                } else {
                    console.log(`📄 ページ取得完了。合計レストラン: ${allRestaurants.length}件`);
                    // すべての結果に対してフィルタリングとランダム抽出を実行
                    processAndResolve(allRestaurants, params, resolve, reject);
                }
                
            } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                if (currentPage === 1) {
                    reject(new Error('指定した条件でお店が見つかりませんでした。検索範囲を広げるか、条件を変更してお試しください。'));
                } else {
                    console.warn('⚠️ 2ページ目でエラーが発生しました。1ページ目の結果のみを使用します。');
                    processAndResolve(allRestaurants, params, resolve, reject);
                }
            } else if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) {
                reject(new Error('Google Maps APIのリクエストが拒否されました。APIキーが正しく設定されているか確認してください。'));
            } else if (status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) {
                reject(new Error('Google Maps APIのリクエスト制限に達しました。しばなし時間をおいて再度お試しください。'));
            } else {
                if (currentPage === 1) {
                    reject(new Error(`Google Maps API エラー: ${status}`));
                } else {
                    console.warn(`⚠️ 2ページ目でエラーが発生しました（${status}）。1ページ目の結果のみを使用します。`);
                    processAndResolve(allRestaurants, params, resolve, reject);
                }
            }
        };
        
        // 1回目のリクエストを実行
        service.nearbySearch(request, searchCallback);
    });
}

// フィルタリングとランダム抽出を行い、結果をresolveする
function processAndResolve(allRestaurants, params, resolve, reject) {
    console.log('🏪 変換されたレストラン:', allRestaurants.length, '件');
    
    // フィルタリング（予算と時間帯）
    const filteredRestaurants = filterRestaurants(allRestaurants, params);
    
    if (filteredRestaurants.length === 0) {
        const errorMsg = params.timeSlot === 'lunch' 
            ? '指定した条件（予算・ランチ営業）に合うお店が見つかりませんでした。条件を変更してお試しください。'
            : '指定した条件（予算）に合うお店が見つかりませんでした。予算の範囲を広げてお試しください。';
        reject(new Error(errorMsg));
        return;
    }
    
    // ランダムに3件選択
    resolve(getRandomRestaurants(filteredRestaurants, 3));
}


// ランチ営業の有無を判定
function isLunchOpen(restaurant) {
    // typesに'restaurant'や'cafe'が含まれる場合はランチ営業ありと見なす
    if (restaurant.types && Array.isArray(restaurant.types)) {
        const restaurantTypes = restaurant.types.map(t => t.toLowerCase());
        if (restaurantTypes.includes('restaurant') || restaurantTypes.includes('cafe') || 
            restaurantTypes.includes('food') || restaurantTypes.includes('meal_takeaway')) {
            console.log(`🍽️ ランチ営業あり（タイプ）: ${restaurant.name}`);
            return true;
        }
    }
    
    // 営業時間文字列をチェック
    if (restaurant.weekday_text && Array.isArray(restaurant.weekday_text)) {
        const hoursText = restaurant.weekday_text.join(' ').toLowerCase();
        
        // 「ランチ」という単語が含まれているかチェック
        if (hoursText.includes('ランチ') || hoursText.includes('lunch')) {
            console.log(`🍽️ ランチ営業あり（キーワード）: ${restaurant.name}`);
            return true;
        }
        
        // ランチ時間帯（11:00～15:00頃）の時刻が含まれているかチェック
        const lunchTimePatterns = [
            /11:\d{2}/,  // 11:00-11:59
            /12:\d{2}/,  // 12:00-12:59
            /13:\d{2}/,  // 13:00-13:59
            /14:\d{2}/,  // 14:00-14:59
            /15:\d{2}/   // 15:00-15:59
        ];
        
        for (const pattern of lunchTimePatterns) {
            if (pattern.test(hoursText)) {
                console.log(`🍽️ ランチ営業あり（時刻）: ${restaurant.name}`);
                return true;
            }
        }
    }
    
    console.log(`🍽️ ランチ営業情報なし: ${restaurant.name}`);
    return false;
}

// レストランのフィルタリング（予算と時間帯）
function filterRestaurants(restaurants, params) {
    let filtered = [...restaurants];
    
    console.log('🔍 フィルタリング開始:', { 
        totalRestaurants: restaurants.length, 
        params: params 
    });
    
    // 厳密な予算フィルタリング（minBudget/maxBudgetによる絞り込み）
    if (params.minBudget !== undefined && params.maxBudget !== undefined) {
        const minBudget = parseInt(params.minBudget) || 0;
        const maxBudget = parseInt(params.maxBudget) || 99999;
        
        // 指定なしの場合はスキップ
        if (minBudget !== 0 || maxBudget !== 99999) {
            console.log('💰 厳密な予算フィルタリング:', { minBudget, maxBudget });
            
            filtered = filtered.filter(restaurant => {
                // Google Maps Places APIのprice_levelを金額に変換
                let averageBudget = null;
                
                if (restaurant.price_level !== null && restaurant.price_level !== undefined) {
                    // price_level: 0=～500円, 1=500～1000円, 2=1000～2000円, 3=2000～4000円, 4=4000円～
                    const priceRanges = [500, 1000, 2000, 4000, 8000];
                    averageBudget = priceRanges[restaurant.price_level] || null;
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
    
    // ランチ時間帯のフィルタリング
    if (params.timeSlot === 'lunch') {
        console.log('🍽️ ランチフィルタリング開始');
        
        filtered = filtered.filter(restaurant => {
            const hasLunch = isLunchOpen(restaurant);
            if (!hasLunch) {
                console.log(`❌ ランチ営業なしで除外: ${restaurant.name}`);
            }
            return hasLunch;
        });
        
        console.log('🍽️ ランチフィルタリング後:', filtered.length);
    }
    
    console.log('✅ 最終フィルタリング結果:', filtered.length);
    
    return filtered;
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
    // Google Maps Places APIのvicinity（住所）を表示
    if (restaurant.address) {
        return restaurant.address;
    }
    
    return 'アクセス情報なし';
}

// 予算情報を取得（ランチ/ディナー対応）
function getBudgetInfo(restaurant, selectedTime) {
    console.log('🔍 予算情報取得:', { restaurant, selectedTime });

    // Google Maps Places APIのprice_levelから予算情報を取得
    if (restaurant.price_level !== null && restaurant.price_level !== undefined) {
        const priceNames = ['～500円', '500円～1000円', '1000円～2000円', '2000円～4000円', '4000円～'];
        const priceName = priceNames[restaurant.price_level] || '価格情報なし';
        console.log('💰 価格レベル:', restaurant.price_level, '-', priceName);
        return priceName;
    }

    // フォールバック: budget.nameがある場合
    if (restaurant.budget && restaurant.budget.name) {
        console.log('💰 予算名:', restaurant.budget.name);
        return restaurant.budget.name;
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
        
        // Google Mapリンクの構築
        let googleMapUrl = '';
        if (restaurant.place_id) {
            googleMapUrl = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${restaurant.place_id}`;
        }
        
        // ホットペッパーグルメの店舗ページURLを取得
        const shopUrl = restaurant.urls?.pc || restaurant.urls?.sp || restaurant.url || '';
        
        console.log(`🏪 レストラン${index + 1}:`, {
            name: restaurant.name,
            selectedTime: selectedTime,
            budgetInfo: budgetInfo,
            shopUrl: shopUrl,
            googleMapUrl: googleMapUrl,
            place_id: restaurant.place_id,
            restaurantData: restaurant
        });
        
        // 店舗名をGoogle Mapリンクにする（place_idがある場合）
        const restaurantNameHTML = googleMapUrl 
            ? `<a href="${googleMapUrl}" target="_blank" rel="noopener noreferrer" class="restaurant-link">${restaurant.name}</a>`
            : restaurant.name;
        
        // 住所もGoogle Mapリンクにする（place_idがある場合）
        const addressHTML = googleMapUrl
            ? `<a href="${googleMapUrl}" target="_blank" rel="noopener noreferrer" class="restaurant-link">${restaurant.address}</a>`
            : restaurant.address;
        
        return `
        <div class="restaurant-card">
            <div class="restaurant-name">${restaurantNameHTML}</div>
            <div class="restaurant-info">
                <div class="info-item">
                    <span>📍</span>
                    <span>${addressHTML}</span>
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

// Google Maps JavaScript APIの読み込み確認
function checkGoogleMapsAPI() {
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        console.warn('⚠️ Google Maps JavaScript APIが読み込まれていません。');
        console.log('index.htmlでGoogle Maps JavaScript APIが正しく読み込まれているか確認してください。');
        return false;
    }
    console.log('✅ Google Maps JavaScript APIが正常に読み込まれています。');
    return true;
}
