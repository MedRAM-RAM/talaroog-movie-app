// ثوابت التطبيق
const API_BASE_URL = 'https://yts.bz/api/v2/';
const CORS_PROXY_URL = ''; // تم إزالة البروكسي لأنه يسبب أخطاء 403 حالياً
const DEFAULT_LIMIT = 20;

// متغيرات عامة
let currentPage = 1;
let totalMovies = 0;
let totalPages = 0;
let currentMovies = [];
let client = null; // WebTorrent client
let currentSortValue = 'date_added';
let currentSortDirection = 'desc';
let currentGenreValue = '';
let currentRatingValue = '0';

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener("DOMContentLoaded", () => {
  // تهيئة WebTorrent client
  if (typeof WebTorrent !== "undefined") {
    client = new WebTorrent();
  }

  // تسجيل مستمعي الأحداث
  registerEventListeners();

  // تحميل الأفلام الافتراضية
  loadMovies();

  // تسجيل Service Worker لدعم PWA
  registerServiceWorker();
  
  // التحقق من وجود بيانات مشاركة وعرض النافذة المنبثقة إذا لزم الأمر
  checkForSharedDataAndShowPopup(); 
});

/**
 * التحقق من وجود بيانات مشاركة في الـ URL وعرض النافذة المنبثقة.
 * يحدد مصطلح البحث حسب الأولوية: IMDb ID > العنوان الخام > عنوان Trakt > النص/الرابط المدمج.
 */
function checkForSharedDataAndShowPopup() {
  const urlParams = new URLSearchParams(window.location.search);
  const sharedTitle = urlParams.get("title")?.trim() || null;
  const sharedText = urlParams.get("text")?.trim() || null;
  const sharedUrl = urlParams.get("url")?.trim() || null;

  let finalSearchTerm = null;
  let extractedImdbId = null;
  let extractedTraktTitle = null;

  // 1. البحث عن IMDb ID في جميع البيانات المشتركة
  const combinedSharedData = [sharedTitle, sharedText, sharedUrl].filter(Boolean).join(' ');
  const imdbRegex = /tt\d{7,}/;
  const imdbMatch = combinedSharedData.match(imdbRegex);
  if (imdbMatch) {
    extractedImdbId = imdbMatch[0];
    finalSearchTerm = extractedImdbId;
    console.log('[Share Target] Found IMDb ID:', finalSearchTerm);
  }

  // 2. إذا لم يتم العثور على IMDb ID، استخدم العنوان الخام (title)
  if (!finalSearchTerm && sharedTitle) {
    finalSearchTerm = sharedTitle;
    console.log('[Share Target] Using raw title:', finalSearchTerm);
  }

  // 3. إذا لم يتم العثور على IMDb ID أو عنوان خام، حاول استخراج عنوان Trakt
  if (!finalSearchTerm && sharedUrl && sharedUrl.includes("trakt.tv/")) {
    try {
      const urlObject = new URL(sharedUrl);
      const pathParts = urlObject.pathname.split('/').filter(part => part !== ""); // Split path and remove empty parts

      // التحقق من بنية الرابط (أفلام أو مسلسلات)
      if ((pathParts[0] === 'movies' || pathParts[0] === 'shows') && pathParts.length >= 2) {
        let titleFromTrakt = pathParts[1];
        // أولاً، استبدل الشرطات بمسافات
        titleFromTrakt = titleFromTrakt.replace(/-/g, ' ');
        // ثم، قم بإزالة السنة من النهاية (إذا كانت موجودة ومسبوقة بمسافة)
        titleFromTrakt = titleFromTrakt.replace(/ \d{4}$/, ''); 
        // تحويل الحرف الأول من كل كلمة إلى كبير
        titleFromTrakt = titleFromTrakt.replace(/\b\w/g, l => l.toUpperCase());
        extractedTraktTitle = titleFromTrakt.trim(); // إزالة أي مسافات زائدة
        finalSearchTerm = extractedTraktTitle;
        console.log("[Share Target] Extracted Trakt title (v2):", finalSearchTerm);
      }
    } catch (e) {
      console.error("[Share Target] Error parsing Trakt URL:", e);
    }
  }

  // 4. إذا لم يتم العثور على أي مما سبق، استخدم النص أو الرابط المدمج
  if (!finalSearchTerm) {
    const fallbackTerm = [sharedText, sharedUrl].filter(Boolean).join(" ").trim();
    if (fallbackTerm) {
        finalSearchTerm = fallbackTerm;
        console.log("[Share Target] Using combined text/URL fallback:", finalSearchTerm);
    }
  }

  if (finalSearchTerm) {
    showSharePopup(finalSearchTerm);
  }
}

/**
 * إظهار النافذة المنبثقة مع البيانات المشتركة.
 * @param {string} data - البيانات المدمجة المراد عرضها.
 */
function showSharePopup(data) {
  const sharePopup = document.getElementById("share-popup");
  const popupTextElement = document.getElementById("popup-shared-text");
  
  if (sharePopup && popupTextElement) {
    popupTextElement.textContent = data;
    sharePopup.style.display = "flex"; // Use flex to center content vertically/horizontally
  } else {
    console.error("Popup elements not found!");
  }
}

/**
 * إخفاء النافذة المنبثقة.
 */
function hideSharePopup() {
  const sharePopup = document.getElementById("share-popup");
  if (sharePopup) {
    sharePopup.style.display = "none";
  }
  // لا تقم بإزالة باراميترات الـ URL هنا، بل عند تأكيد البحث
}

/**
 * تسجيل مستمعي الأحداث للعناصر التفاعلية
 */
function registerEventListeners() {
  // ... (الكود السابق لمستمعي البحث والفرز والتصنيف يبقى كما هو)
  
  // نموذج البحث
  const searchForm = document.getElementById('search-form');
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const searchInput = document.getElementById('search-input');
    const query = searchInput.value.trim();
    if (query) {
      currentPage = 1;
      loadMovies({ query });
    }
  });
  
  // مستمع لضغط Enter في حقل البحث
  const searchInput = document.getElementById("search-input");
  const clearSearchButton = document.getElementById("clear-search-button"); // تعريف زر المسح

  // إظهار/إخفاء زر المسح بناءً على محتوى حقل البحث
  searchInput.addEventListener("input", () => {
    if (searchInput.value.length > 0) {
      clearSearchButton.style.display = "block";
    } else {
      clearSearchButton.style.display = "none";
    }
  });

  // مسح حقل البحث عند النقر على زر المسح
  clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    clearSearchButton.style.display = "none";
    searchInput.focus(); // إعادة التركيز على حقل البحث
    // يمكنك إلغاء التعليق عن السطر التالي إذا أردت تحديث قائمة الأفلام فوراً بعد المسح
    // loadMovies(); 
  });

  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (query) {
        currentPage = 1;
        loadMovies({ query });
      }
    }
  });
  
  // زر الفرز
  const sortButton = document.getElementById('sort-button');
  const sortDropdownContent = document.getElementById('sort-dropdown-content');
  
  // فتح/إغلاق قائمة الفرز المنسدلة
  sortButton.addEventListener('click', () => {
    sortDropdownContent.classList.toggle('active');
  });
  
  // إغلاق قائمة الفرز عند النقر خارجها
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.sort-dropdown') && sortDropdownContent.classList.contains('active')) {
      sortDropdownContent.classList.remove('active');
    }
  });
  
  // خيارات الفرز
  const sortOptions = document.querySelectorAll('.sort-option');
  sortOptions.forEach(option => {
    option.addEventListener('click', () => {
      // إزالة الفئة النشطة من جميع الخيارات
      sortOptions.forEach(opt => opt.classList.remove('active'));
      
      // إضافة الفئة النشطة للخيار المحدد
      option.classList.add('active');
      
      // تحديث قيمة الفرز
      currentSortValue = option.dataset.value;
      document.getElementById('sort-filter').value = currentSortValue;
      
      // إعادة تحميل الأفلام
      currentPage = 1;
      loadMovies();
      
      // إغلاق القائمة المنسدلة
      sortDropdownContent.classList.remove('active');
    });
  });
  
  // خيارات التصنيف (الشريط الأفقي الجديد)
  const genreTags = document.querySelectorAll('.genre-tag');
  genreTags.forEach(tag => {
    tag.addEventListener('click', () => {
      // إزالة الفئة النشطة من جميع الخيارات
      genreTags.forEach(t => t.classList.remove('active'));
      
      // إضافة الفئة النشطة للخيار المحدد
      tag.classList.add('active');
      
      // تحديث قيمة التصنيف
      currentGenreValue = tag.dataset.value;
      document.getElementById('genre-filter').value = currentGenreValue;
      
      // إعادة تحميل الأفلام
      currentPage = 1;
      loadMovies();
    });
  });
  
  // اتجاه الفرز
  const sortDirectionRadios = document.querySelectorAll('input[name="sort-direction"]');
  sortDirectionRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      currentSortDirection = radio.value;
      document.getElementById('order-filter').value = currentSortDirection;
      
      // إعادة تحميل الأفلام
      currentPage = 1;
      loadMovies();
    });
  });
  
  // تحديد الخيارات النشطة افتراضيًا
  const defaultSortOption = document.querySelector(`.sort-option[data-value="${currentSortValue}"]`);
  if (defaultSortOption) {
    defaultSortOption.classList.add('active');
  }
  
  const defaultGenreTag = document.querySelector(`.genre-tag[data-value="${currentGenreValue}"]`);
  if (defaultGenreTag) {
    defaultGenreTag.classList.add('active');
  }
  
  // إغلاق نافذة تفاصيل الفيلم عند الضغط على Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMovieDetails();
      closePosterModal();
      hideSharePopup(); // أغلق النافذة المنبثقة أيضاً
      
      // إغلاق قائمة الفرز المنسدلة
      if (sortDropdownContent.classList.contains('active')) {
        sortDropdownContent.classList.remove('active');
      }
    }
  });

  // --- مستمعات أحداث النافذة المنبثقة --- 
  const popupCloseButton = document.getElementById("popup-close-button");
  const popupSearchButton = document.getElementById("popup-search-button");
  const popupTextElement = document.getElementById("popup-shared-text");

  if (popupCloseButton) {
    popupCloseButton.addEventListener("click", hideSharePopup);
  }
  if (popupSearchButton && popupTextElement && searchInput) {
    popupSearchButton.addEventListener("click", () => {
      const query = popupTextElement.textContent;
      if (query) {
        // ضع النص في مربع البحث الرئيسي
        searchInput.value = query;
        
        // استخدم نفس منطق البحث الرئيسي تماماً
        const searchButton = document.getElementById('search-button');
        if (searchButton) {
          // محاكاة الضغط على زر البحث الرئيسي
          searchButton.click();
        } else {
          // احتياطي في حالة عدم وجود زر البحث
          currentPage = 1;
          loadMovies({ query });
        }
        
        // أغلق النافذة المنبثقة
        hideSharePopup();
        
        // إزالة باراميترات المشاركة من الـ URL الآن بعد تأكيد البحث
        try {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (e) {
          console.error("Error cleaning URL parameters after popup search:", e);
        }
      }
    });
  }
}

/**
 * تحميل الأفلام من API
 * @param {Object} options - خيارات إضافية للتحميل
 */
async function loadMovies(options = {}) {
  showLoading(true);
  
  try {
    // جمع معلمات الفلترة
    const genreFilter = document.getElementById('genre-filter').value;
    const ratingFilter = document.getElementById('rating-filter').value;
    const sortFilter = document.getElementById('sort-filter').value;
    const orderFilter = document.getElementById('order-filter').value;
    
    // بناء معلمات الاستعلام
    const params = new URLSearchParams({
      limit: DEFAULT_LIMIT,
      page: currentPage,
      sort_by: sortFilter,
      order_by: orderFilter,
      minimum_rating: ratingFilter
    });
    
    // إضافة معلمات اختيارية
    if (genreFilter) params.append('genre', genreFilter);
    // تعديل: البحث باستخدام query_term أو imdb_id حسب نوع الاستعلام
    if (options.query) {
      if (/^tt\d{7,}$/.test(options.query)) {
        params.append('query_term', options.query); // YTS API يدعم البحث بـ IMDb ID مباشرة
      } else {
        params.append('query_term', options.query);
      }
    }
    
    // إجراء طلب API
    const response = await fetch(`${API_BASE_URL}list_movies.json?${params.toString()}`);
    const data = await response.json();
    
    if (data.status === 'ok' && data.data.movies && data.data.movies.length > 0) {
      currentMovies = data.data.movies;
      totalMovies = data.data.movie_count;
      totalPages = Math.ceil(totalMovies / DEFAULT_LIMIT);
      
      renderMovies(currentMovies);
      renderPagination();
    } else {
      currentMovies = [];
      renderMovies([]);
      renderPagination();
      if (options.query) {
        showNotification('error', 'No movies found for your search.');
      }
    }
  } catch (error) {
    console.error('خطأ في تحميل الأفلام:', error);
    showNotification('error', 'حدث خطأ أثناء تحميل الأفلام');
    renderMovies([]);
    renderPagination();
  } finally {
    showLoading(false);
  }
}

/**
 * عرض الأفلام في الشبكة
 * @param {Array} movies - قائمة الأفلام
 */
function renderMovies(movies) {
  const moviesGrid = document.getElementById('movies-grid');
  moviesGrid.innerHTML = '';
  
  if (!movies || movies.length === 0) {
    moviesGrid.innerHTML = '<div class="no-results">لا توجد أفلام متطابقة مع معايير البحث</div>';
    return;
  }
  
  movies.forEach(movie => {
    const card = createMovieCard(movie);
    moviesGrid.appendChild(card);
  });
}

/**
 * إنشاء بطاقة فيلم
 * @param {Object} movie - بيانات الفيلم
 * @returns {HTMLElement} - عنصر HTML للبطاقة
 */
function createMovieCard(movie) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.dataset.id = movie.id;
  
  // إنشاء محتوى البطاقة
  card.innerHTML = `
    <div class="movie-poster">
      <img src="${movie.medium_cover_image || createDefaultPosterImage()}" alt="${movie.title}" loading="lazy" onerror="this.src='${createDefaultPosterImage()}'">
      <div class="movie-rating"><i class="fas fa-star"></i> ${movie.rating || '0.0'}</div>
      <div class="poster-buttons" style="display: none;">
        <button class="poster-button details-button"><i class="fas fa-info-circle"></i> تفاصيل</button>
        <button class="poster-button download-button"><i class="fas fa-download"></i> تحميل</button>
      </div>
    </div>
    <div class="movie-info">
      <h3 class="movie-title">${movie.title}</h3>
      <div class="movie-year">${movie.year}</div>
    </div>
  `;
  
  // إضافة مستمعي الأحداث
  const posterImage = card.querySelector('.movie-poster img');
  const posterButtons = card.querySelector('.poster-buttons');
  
  // تعديل سلوك النقر على البوستر ليظهر الأزرار عند النقرة الأولى ويفتح البوستر عند النقرة الثانية
  let clickCount = 0;
  let clickTimer = null;
  
  posterImage.addEventListener('click', () => {
    clickCount++;
    
    // إعادة ضبط عداد النقرات بعد فترة زمنية
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      clickCount = 0;
      // إخفاء الأزرار بعد انتهاء المهلة إذا لم يتم النقر مرة ثانية
      posterButtons.style.display = 'none';
    }, 2000); // إعادة ضبط بعد ثانيتين
    
    // إظهار الأزرار عند النقرة الأولى
    if (clickCount === 1) {
      posterButtons.style.display = 'flex';
    }
    
    // فتح البوستر فقط عند النقرة الثانية
    if (clickCount === 2) {
      openPosterModal(movie);
      clickCount = 0; // إعادة ضبط العداد بعد النقرة الثانية
    }
  });
  
  const detailsButton = card.querySelector('.details-button');
  detailsButton.addEventListener('click', (e) => {
    e.stopPropagation();
    openMovieDetails(movie.id, false);
  });
  
  const downloadButton = card.querySelector('.download-button');
  downloadButton.addEventListener('click', (e) => {
    e.stopPropagation();
    openMovieDetails(movie.id, true);
  });
  
  return card;
}

/**
 * عرض أزرار التنقل بين الصفحات
 */
function renderPagination() {
  const paginationElement = document.getElementById('pagination');
  paginationElement.innerHTML = '';
  
  if (totalPages <= 1) return;
  
  // إنشاء زر الصفحة السابقة
  if (currentPage > 1) {
    const prevButton = document.createElement('button');
    prevButton.textContent = 'السابق';
    prevButton.addEventListener('click', () => {
      currentPage--;
      loadMovies();
      window.scrollTo(0, 0);
    });
    paginationElement.appendChild(prevButton);
  }
  
  // إنشاء أزرار الصفحات
  const maxButtons = 5;
  const startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);
  
  for (let i = startPage; i <= endPage; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    if (i === currentPage) {
      pageButton.classList.add('active');
    }
    
    pageButton.addEventListener('click', () => {
      if (i !== currentPage) {
        currentPage = i;
        loadMovies();
        window.scrollTo(0, 0);
      }
    });
    
    paginationElement.appendChild(pageButton);
  }
  
  // إنشاء زر الصفحة التالية
  if (currentPage < totalPages) {
    const nextButton = document.createElement('button');
    nextButton.textContent = 'التالي';
    nextButton.addEventListener('click', () => {
      currentPage++;
      loadMovies();
      window.scrollTo(0, 0);
    });
    paginationElement.appendChild(nextButton);
  }
}

/**
 * فتح تفاصيل الفيلم
 * @param {number} movieId - معرف الفيلم
 * @param {boolean} showDownloadOptions - ما إذا كان سيتم عرض خيارات التحميل فقط
 */
async function openMovieDetails(movieId, showDownloadOptions = false) {
  const movieDetailsElement = document.getElementById('movie-details');
  
  // عرض حالة التحميل
  movieDetailsElement.innerHTML = `
    <button class="close-details">&times;</button>
    <div class="loading">
      <div class="loading-spinner"></div>
    </div>
  `;
  
  // إضافة الفئة النشطة
  movieDetailsElement.classList.add('active');
  document.body.style.overflow = 'hidden'; // منع التمرير في الصفحة الرئيسية
  
  try {
    // الحصول على بيانات الفيلم
    const movieData = await getMovieDetails(movieId);
    
    if (showDownloadOptions) {
      // عرض خيارات التحميل فقط في نافذة صغيرة
      let html = `
        <button class="close-details">&times;</button>
        <div class="download-only-container">
          <div class="download-only-header">
            <div class="details-title">
              <h1>${movieData.title}</h1>
            </div>
          </div>
          
          <div class="download-list">
            ${movieData.torrents && movieData.torrents.length > 0 ? movieData.torrents.map(torrent => `
              <div class="download-item">
                <div>
                  <div class="download-quality">${torrent.quality} ${torrent.type}</div>
                  <div class="download-size">${torrent.size}</div>
                </div>
                <a href="magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(`${movieData.title} ${movieData.year} ${torrent.quality} ${torrent.type}`)}" class="download-button" target="_blank"><i class="fas fa-magnet"></i> تحميل</a>
              </div>
            `).join('') : '<div>لا توجد خيارات تحميل متاحة.</div>'}
          </div>
        </div>
      `;
      
      movieDetailsElement.innerHTML = html;
    } else {
      // عرض تفاصيل الفيلم بالكامل
      let html = `
        <button class="close-details">&times;</button>
        <div class="details-container">
          <div class="details-header">
            <img class="details-backdrop" src="${movieData.background_image_original || movieData.background_image || movieData.large_cover_image}" alt="${movieData.title}" onerror="this.src='${createDefaultPosterImage()}'">
            <div class="details-header-content">
              <img class="details-poster" src="${movieData.large_cover_image}" alt="${movieData.title}" onerror="this.src='${createDefaultPosterImage()}'">
              <div class="details-title">
                <h1>${movieData.title}</h1>
                <div class="details-meta">
                  <span class="meta-item"><i class="far fa-calendar-alt"></i> ${movieData.year}</span>
                  <span class="meta-item"><i class="far fa-clock"></i> ${movieData.runtime} دقيقة</span>
                  <span class="meta-item"><i class="fas fa-star"></i> ${movieData.rating}/10</span>
                  <span class="meta-item"><i class="fas fa-language"></i> ${movieData.language.toUpperCase()}</span>
                </div>
                <div class="details-genres">
                  ${movieData.genres ? movieData.genres.map(genre => `<span class="genre-badge">${genre}</span>`).join('') : ''}
                </div>
              </div>
            </div>
          </div>
          
          <div class="details-content">
            <div class="details-main">
              <div class="details-section">
                <h3><i class="fas fa-align-right"></i> قصة الفيلم</h3>
                <p class="summary-text">${movieData.description_full || 'لا يوجد وصف متاح لهذا الفيلم حالياً.'}</p>
              </div>
              
              ${movieData.cast && movieData.cast.length > 0 ? `
                <div class="details-section">
                  <h3><i class="fas fa-users"></i> طاقم التمثيل</h3>
                  <div class="cast-list">
                    ${movieData.cast.slice(0, 8).map(actor => `
                      <div class="cast-item">
                        <div class="cast-photo-container">
                          <img class="cast-photo" src="${actor.url_small_image || ''}" alt="${actor.name}" onerror="this.src='${createDefaultProfileImage()}'">
                        </div>
                        <div class="cast-info">
                          <div class="cast-name">${actor.name}</div>
                          <div class="cast-character">${actor.character_name || ''}</div>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
            
            <div class="details-sidebar">
              <div class="details-section">
                <h3><i class="fas fa-download"></i> روابط التحميل</h3>
                <div class="download-list">
                  ${movieData.torrents && movieData.torrents.length > 0 ? movieData.torrents.map(torrent => `
                    <div class="download-card">
                      <div class="download-info">
                        <span class="quality-tag">${torrent.quality}</span>
                        <span class="type-tag">${torrent.type}</span>
                        <span class="size-tag"><i class="fas fa-file-download"></i> ${torrent.size}</span>
                      </div>
                      <div class="download-actions">
                        <a href="${torrent.url}" class="action-btn torrent-btn" title="تحميل ملف التورنت"><i class="fas fa-file-alt"></i></a>
                        <a href="magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(`${movieData.title} ${movieData.year} ${torrent.quality} ${torrent.type}`)}" class="action-btn magnet-btn" title="رابط مغناطيسي"><i class="fas fa-magnet"></i> تحميل</a>
                      </div>
                    </div>
                  `).join('') : '<p>لا توجد روابط متاحة.</p>'}
                </div>
              </div>
              
              <div class="details-section">
                <h3><i class="fas fa-info-circle"></i> معلومات إضافية</h3>
                <ul class="extra-info-list">
                  <li><strong>تاريخ الرفع:</strong> ${new Date(movieData.date_uploaded).toLocaleDateString('ar-EG')}</li>
                  <li><strong>عدد مرات الإعجاب:</strong> ${movieData.like_count || 0}</li>
                  <li><strong>MPAA:</strong> ${movieData.mpa_rating || 'N/A'}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      `;
      
      movieDetailsElement.innerHTML = html;
    }
    
    // إضافة مستمع لزر الإغلاق
    const closeButton = movieDetailsElement.querySelector('.close-details');
    if (closeButton) {
      closeButton.addEventListener('click', closeMovieDetails);
    }
    
    // عرض رسالة نجاح
    // if (showDownloadOptions) {
    //   showNotification('success', `تم تحميل خيارات التحميل للفيلم \"${movieData.title}\"`);
    // } else {
    //   showNotification('success', `تم تحميل تفاصيل الفيلم \"${movieData.title}\"`);
    // } 
  } catch (error) {
    movieDetailsElement.innerHTML = `
      <button class="close-details">&times;</button>
      <div class="error-message">
        حدث خطأ أثناء تحميل تفاصيل الفيلم. يرجى المحاولة مرة أخرى.
      </div>
    `;
    
    const closeButton = movieDetailsElement.querySelector('.close-details');
    if (closeButton) {
      closeButton.addEventListener('click', closeMovieDetails);
    }
    
    // عرض رسالة خطأ
    showNotification('error', 'حدث خطأ أثناء تحميل تفاصيل الفيلم. يرجى المحاولة مرة أخرى.');
    
    console.error('خطأ في فتح تفاصيل الفيلم:', error);
  }
}

/**
 * إغلاق تفاصيل الفيلم
 */
function closeMovieDetails() {
  const movieDetailsElement = document.getElementById('movie-details');
  movieDetailsElement.classList.remove('active');
  document.body.style.overflow = ''; // استعادة التمرير في الصفحة الرئيسية
}

/**
 * الحصول على تفاصيل الفيلم من API
 * @param {number} movieId - معرف الفيلم
 * @returns {Promise<Object>} - بيانات الفيلم
 */
async function getMovieDetails(movieId) {
  try {
    const params = new URLSearchParams({
      movie_id: movieId,
      with_images: true,
      with_cast: true
    });
    
    const response = await fetch(`${API_BASE_URL}movie_details.json?${params.toString()}`);
    const data = await response.json();
    
    if (data.status === 'ok' && data.data.movie) {
      return data.data.movie;
    } else {
      throw new Error('فشل في الحصول على تفاصيل الفيلم');
    }
  } catch (error) {
    console.error('خطأ في الحصول على تفاصيل الفيلم:', error);
    throw error;
  }
}

/**
 * فتح نافذة عرض البوستر بحجم كبير
 * @param {Object} movie - بيانات الفيلم
 */
function openPosterModal(movie) {
  const posterModal = document.getElementById('poster-modal');
  const posterImage = document.getElementById('poster-modal-image');
  
  posterImage.src = movie.large_cover_image || movie.medium_cover_image;
  posterImage.alt = movie.title;
  
  posterModal.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  // إضافة مستمع لزر الإغلاق
  const closeButton = posterModal.querySelector('.close-poster-modal');
  closeButton.addEventListener('click', closePosterModal);
}

/**
 * إغلاق نافذة عرض البوستر
 */
function closePosterModal() {
  const posterModal = document.getElementById('poster-modal');
  posterModal.classList.remove('active');
  document.body.style.overflow = '';
}

/**
 * إنشاء صورة افتراضية للبوستر
 * @returns {string} - رابط الصورة الافتراضية
 */
function createDefaultPosterImage() {
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
      <rect width="200" height="300" fill="#444" />
      <text x="100" y="150" font-family="Arial" font-size="30" fill="#aaa" text-anchor="middle" dominant-baseline="middle">
        لا توجد صورة
      </text>
    </svg>
  `);
}

/**
 * إنشاء صورة افتراضية للممثل
 * @returns {string} - رابط الصورة الافتراضية
 */
function createDefaultProfileImage() {
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="40" fill="#444" />
      <text x="40" y="40" font-family="Arial" font-size="12" fill="#aaa" text-anchor="middle" dominant-baseline="middle">
        لا توجد صورة
      </text>
    </svg>
  `);
}

/**
 * عرض أو إخفاء حالة التحميل
 * @param {boolean} show - ما إذا كان سيتم عرض حالة التحميل
 */
function showLoading(show) {
  const loadingElement = document.getElementById('loading');
  const moviesGrid = document.getElementById('movies-grid');
  const pagination = document.getElementById('pagination');
  
  if (show) {
    loadingElement.style.display = 'flex';
    moviesGrid.style.display = 'none';
    pagination.style.display = 'none';
  } else {
    loadingElement.style.display = 'none';
    moviesGrid.style.display = 'grid';
    pagination.style.display = 'flex';
  }
}

/**
 * عرض إشعار للمستخدم
 * @param {string} type - نوع الإشعار (success أو error)
 * @param {string} message - نص الإشعار
 */
function showNotification(type, message) {
  const notification = document.getElementById('notification');
  notification.className = 'notification';
  notification.classList.add(`notification-${type}`);
  
  const notificationIcon = notification.querySelector('.notification-icon');
  const notificationMessage = notification.querySelector('.notification-message');
  
  notificationIcon.innerHTML = type === 'success' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-circle"></i>';
  notificationMessage.textContent = message;
  
  notification.classList.add('active');
  
  setTimeout(() => {
    notification.classList.remove('active');
  }, 3000);
}

/**
 * تسجيل Service Worker
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(registration => {
        console.log('Service Worker تم تسجيله بنجاح:', registration);
      })
      .catch(error => {
        console.error('فشل في تسجيل Service Worker:', error);
      });
  }
}

/**
 * معالجة الروابط المشاركة من التطبيقات الأخرى
 */
function handleSharedLinks() {
  if (navigator.share) {
    console.log('Web Share API مدعومة');
  }
  
  // معالجة الروابط المشاركة عبر Web Share Target API
  if (window.location.search) {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text');
    
    if (sharedUrl && sharedUrl.includes('magnet:')) {
      console.log('تم استلام رابط مغناطيسي مشارك:', sharedUrl);
      // معالجة الرابط المغناطيسي
      if (client) {
        client.add(sharedUrl);
      }
    }
  }
}

