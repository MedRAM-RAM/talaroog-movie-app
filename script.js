// ثوابت التطبيق
const API_BASE_URL = 'https://yts.bz/api/v2/';
const DEFAULT_LIMIT = 20;

// متغيرات عامة
let currentPage = 1;
let totalMovies = 0;
let totalPages = 0;
let currentMovies = [];
let currentSortValue = 'date_added';
let currentSortDirection = 'desc';
let currentGenreValue = '';
let currentRatingValue = '0';

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener("DOMContentLoaded", () => {
  // تسجيل مستمعي الأحداث
  registerEventListeners();

  // التحقق من وجود بيانات مشاركة (Share Target)
  const sharedQuery = checkForSharedData();
  
  if (sharedQuery) {
    // إذا وجدنا معرف IMDb أو نص بحث، نقوم بالبحث عنه مباشرة
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = sharedQuery;
    loadMovies({ query: sharedQuery });
    
    // تنظيف الـ URL من باراميترات المشاركة
    const newUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
  } else {
    // تحميل الأفلام الافتراضية إذا لم يكن هناك بحث
    loadMovies();
  }

  // تسجيل Service Worker لدعم PWA
  registerServiceWorker();
});

/**
 * التحقق من وجود بيانات مشاركة في الـ URL واستخراج معرف IMDb أو نص البحث.
 */
function checkForSharedData() {
  const urlParams = new URLSearchParams(window.location.search);
  const title = urlParams.get('title');
  const text = urlParams.get('text');
  const url = urlParams.get('url');
  
  const combinedData = [title, text, url].filter(Boolean).join(' ');
  
  if (!combinedData) return null;
  
  // محاولة استخراج IMDb ID (tt followed by at least 7 digits)
  const imdbMatch = combinedData.match(/tt\d{7,}/);
  if (imdbMatch) {
    console.log('Found IMDb ID in shared data:', imdbMatch[0]);
    return imdbMatch[0];
  }
  
  // إذا لم نجد IMDb ID، نستخدم النص المتوفر كبحث عام
  return title || text || url;
}

/**
 * تسجيل مستمعي الأحداث للعناصر التفاعلية
 */
function registerEventListeners() {
  // نموذج البحث
  const searchForm = document.getElementById('search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      const query = searchInput.value.trim();
      if (query) {
        currentPage = 1;
        loadMovies({ query });
      }
    });
  }
  
  const searchInput = document.getElementById("search-input");
  const clearSearchButton = document.getElementById("clear-search-button");

  if (searchInput && clearSearchButton) {
    searchInput.addEventListener("input", () => {
      clearSearchButton.style.display = searchInput.value.length > 0 ? "block" : "none";
    });

    clearSearchButton.addEventListener("click", () => {
      searchInput.value = "";
      clearSearchButton.style.display = "none";
      searchInput.focus();
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
  }
  
  // زر الفرز
  const sortButton = document.getElementById('sort-button');
  const sortDropdownContent = document.getElementById('sort-dropdown-content');
  
  if (sortButton && sortDropdownContent) {
    sortButton.addEventListener('click', (e) => {
      e.stopPropagation();
      sortDropdownContent.classList.toggle('active');
    });
    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sort-dropdown') && sortDropdownContent.classList.contains('active')) {
        sortDropdownContent.classList.remove('active');
      }
    });
  }
  
  // خيارات الفرز
  const sortOptions = document.querySelectorAll('.sort-option');
  sortOptions.forEach(option => {
    option.addEventListener('click', () => {
      sortOptions.forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      
      currentSortValue = option.dataset.value;
      const sortFilterInput = document.getElementById('sort-filter');
      if (sortFilterInput) sortFilterInput.value = currentSortValue;
      
      currentPage = 1;
      loadMovies();
      if (sortDropdownContent) sortDropdownContent.classList.remove('active');
    });
  });
  
  // خيارات التصنيف
  const genreTags = document.querySelectorAll('.genre-tag');
  genreTags.forEach(tag => {
    tag.addEventListener('click', () => {
      genreTags.forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      
      currentGenreValue = tag.dataset.value;
      const genreFilterInput = document.getElementById('genre-filter');
      if (genreFilterInput) genreFilterInput.value = currentGenreValue;
      
      currentPage = 1;
      loadMovies();
    });
  });
  
  // اتجاه الفرز
  const sortDirectionRadios = document.querySelectorAll('input[name="sort-direction"]');
  sortDirectionRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      currentSortDirection = radio.value;
      const orderFilterInput = document.getElementById('order-filter');
      if (orderFilterInput) orderFilterInput.value = currentSortDirection;
      
      currentPage = 1;
      loadMovies();
    });
  });
  
  // إغلاق نافذة تفاصيل الفيلم عند الضغط على Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMovieDetails();
      if (sortDropdownContent && sortDropdownContent.classList.contains('active')) {
        sortDropdownContent.classList.remove('active');
      }
    }
  });
}

/**
 * تحميل الأفلام من API
 */
async function loadMovies(options = {}) {
  showLoading(true);
  
  try {
    const genreFilter = document.getElementById('genre-filter')?.value || currentGenreValue;
    const ratingFilter = document.getElementById('rating-filter')?.value || currentRatingValue;
    const sortFilter = document.getElementById('sort-filter')?.value || currentSortValue;
    const orderFilter = document.getElementById('order-filter')?.value || currentSortDirection;
    
    const params = new URLSearchParams({
      limit: DEFAULT_LIMIT,
      page: currentPage,
      sort_by: sortFilter,
      order_by: orderFilter,
      minimum_rating: ratingFilter
    });
    
    if (genreFilter) params.append('genre', genreFilter);
    if (options.query) params.append('query_term', options.query);
    
    const response = await fetch(`${API_BASE_URL}list_movies.json?${params.toString()}`);
    const data = await response.json();
    
    if (data.status === 'ok' && data.data.movies) {
      currentMovies = data.data.movies;
      totalMovies = data.data.movie_count;
      totalPages = Math.ceil(totalMovies / DEFAULT_LIMIT);
      
      renderMovies(currentMovies);
      renderPagination();
    } else {
      renderMovies([]);
      renderPagination();
      if (options.query) showNotification('error', 'No movies found.');
    }
  } catch (error) {
    console.error('Error loading movies:', error);
    showNotification('error', 'Failed to load movies.');
    renderMovies([]);
  } finally {
    showLoading(false);
  }
}

/**
 * عرض الأفلام في الشبكة
 */
function renderMovies(movies) {
  const moviesGrid = document.getElementById('movies-grid');
  if (!moviesGrid) return;
  moviesGrid.innerHTML = '';
  
  if (!movies || movies.length === 0) {
    moviesGrid.innerHTML = '<div class="no-results">No movies found matching your criteria.</div>';
    return;
  }
  
  movies.forEach(movie => {
    const card = createMovieCard(movie);
    moviesGrid.appendChild(card);
  });
}

/**
 * إنشاء بطاقة فيلم
 */
function createMovieCard(movie) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  
  card.innerHTML = `
    <div class="movie-poster">
      <img src="${movie.medium_cover_image || createDefaultPosterImage()}" alt="${movie.title}" loading="lazy" onerror="this.src='${createDefaultPosterImage()}'">
      <div class="movie-rating"><i class="fas fa-star"></i> ${movie.rating || '0.0'}</div>
      <div class="poster-buttons">
        <button class="poster-button details-button"><i class="fas fa-info-circle"></i> Details</button>
        <button class="poster-button download-button"><i class="fas fa-download"></i> Download</button>
      </div>
    </div>
    <div class="movie-info">
      <h3 class="movie-title">${movie.title}</h3>
      <div class="movie-year">${movie.year}</div>
    </div>
  `;
  
  card.querySelector('.details-button').addEventListener('click', () => openMovieDetails(movie.id));
  card.querySelector('.download-button').addEventListener('click', () => openMovieDetails(movie.id, true));
  
  return card;
}

/**
 * فتح تفاصيل الفيلم
 */
async function openMovieDetails(movieId, showDownloadOnly = false) {
  const movieDetailsElement = document.getElementById('movie-details');
  if (!movieDetailsElement) return;

  movieDetailsElement.innerHTML = `<div class="loading"><div class="loading-spinner"></div></div>`;
  movieDetailsElement.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  try {
    const response = await fetch(`${API_BASE_URL}movie_details.json?movie_id=${movieId}&with_images=true&with_cast=true`);
    const data = await response.json();
    const movie = data.data.movie;
    
    let html = `<button class="close-details">&times;</button><div class="details-container">`;
    
    // Header with Backdrop
    html += `
      <div class="details-header">
        <img class="details-backdrop" src="${movie.background_image_original || movie.large_cover_image}" alt="backdrop">
        <div class="details-header-content">
          <img class="details-poster" src="${movie.large_cover_image}" alt="${movie.title}">
          <div class="details-title">
            <h1>${movie.title}</h1>
            <div class="details-meta">
              <span><i class="far fa-calendar-alt"></i> ${movie.year}</span>
              <span><i class="far fa-clock"></i> ${movie.runtime} min</span>
              <span><i class="fas fa-star"></i> ${movie.rating}/10</span>
            </div>
            <div class="details-genres">
              ${movie.genres ? movie.genres.map(g => `<span class="genre-badge">${g}</span>`).join('') : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="details-content">
        <div class="details-main">
          <div class="details-section">
            <h3>Storyline</h3>
            <p>${movie.description_full || 'No description available.'}</p>
          </div>
          ${movie.cast ? `
            <div class="details-section">
              <h3>Cast</h3>
              <div class="cast-list">
                ${movie.cast.slice(0, 6).map(c => `
                  <div class="cast-item">
                    <img class="cast-photo" src="${c.url_small_image || createDefaultProfileImage()}" alt="${c.name}" onerror="this.src='${createDefaultProfileImage()}'">
                    <div class="cast-info"><p>${c.name}</p><span>${c.character_name || ''}</span></div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="details-sidebar">
          <div class="details-section">
            <h3>Downloads</h3>
            ${movie.torrents ? movie.torrents.map(t => `
              <div class="download-card">
                <span class="quality-tag">${t.quality}</span>
                <span>${t.size}</span>
                <a href="magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title)}" class="magnet-btn"><i class="fas fa-magnet"></i> Magnet</a>
              </div>
            `).join('') : '<p>No downloads available.</p>'}
          </div>
        </div>
      </div>
    </div>`;
    
    movieDetailsElement.innerHTML = html;
    movieDetailsElement.querySelector('.close-details').addEventListener('click', closeMovieDetails);
    
  } catch (error) {
    console.error('Error fetching details:', error);
    movieDetailsElement.innerHTML = `<button class="close-details">&times;</button><div class="error-message">Failed to load details.</div>`;
    movieDetailsElement.querySelector('.close-details').addEventListener('click', closeMovieDetails);
  }
}

function closeMovieDetails() {
  const el = document.getElementById('movie-details');
  if (el) el.classList.remove('active');
  document.body.style.overflow = '';
}

function renderPagination() {
  const el = document.getElementById('pagination');
  if (!el) return;
  el.innerHTML = '';
  
  if (totalPages <= 1) return;
  
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  
  for (let i = start; i <= end; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    if (i === currentPage) btn.className = 'active';
    btn.onclick = () => { currentPage = i; loadMovies(); window.scrollTo(0,0); };
    el.appendChild(btn);
  }
}

function showLoading(show) {
  const el = document.getElementById('loading');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function showNotification(type, message) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.querySelector('.notification-message').textContent = message;
  el.className = `notification ${type} active`;
  setTimeout(() => el.classList.remove('active'), 3000);
}

function createDefaultPosterImage() {
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="100%" height="100%" fill="#333"/><text x="50%" y="50%" fill="#666" text-anchor="middle">No Image</text></svg>');
}

function createDefaultProfileImage() {
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><circle cx="25" cy="25" r="25" fill="#444"/></svg>');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.error('SW failed:', err));
  }
}
