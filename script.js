/**
 * TALAROOG - Movie Search & Download Application
 * JavaScript Logic
 */

// متغيرات الحالة العامة
let currentPage = 1;
let totalPages = 1;
let currentSearchQuery = '';
let currentSortBy = 'date_added';
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
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = sharedQuery;
    loadMovies({ query: sharedQuery });
    
    const newUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
  } else {
    loadMovies();
  }

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
  
  const imdbMatch = combinedData.match(/tt\d{7,}/);
  if (imdbMatch) return imdbMatch[0];
  
  return title || text || url;
}

/**
 * تسجيل مستمعي الأحداث للعناصر التفاعلية
 */
function registerEventListeners() {
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');
  const clearSearch = document.getElementById('clear-search');

  if (searchButton) {
    searchButton.addEventListener('click', () => {
      currentSearchQuery = searchInput.value.trim();
      currentPage = 1;
      loadMovies();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        currentSearchQuery = searchInput.value.trim();
        currentPage = 1;
        loadMovies();
      }
    });

    searchInput.addEventListener('input', () => {
      if (clearSearch) {
        clearSearch.style.display = searchInput.value ? 'block' : 'none';
      }
    });
  }

  if (clearSearch) {
    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      clearSearch.style.display = 'none';
      currentSearchQuery = '';
      currentPage = 1;
      loadMovies();
    });
  }

  const sortButton = document.getElementById('sort-button');
  const sortDropdown = document.getElementById('sort-dropdown');
  
  if (sortButton && sortDropdown) {
    sortButton.addEventListener('click', (e) => {
      e.stopPropagation();
      sortDropdown.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      sortDropdown.classList.remove('active');
    });
  }

  const sortOptions = document.querySelectorAll('.sort-option');
  sortOptions.forEach(option => {
    option.addEventListener('click', () => {
      const sortBy = option.dataset.sort;
      if (sortBy) {
        currentSortBy = sortBy;
        sortOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        currentPage = 1;
        loadMovies();
        if (sortDropdown) sortDropdown.classList.remove('active');
      }
    });
  });

  const genreTags = document.querySelectorAll('.genre-tag');
  genreTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const genre = tag.dataset.genre;
      currentGenreValue = genre === 'all' ? '' : genre;
      genreTags.forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      currentPage = 1;
      loadMovies();
    });
  });
}

/**
 * جلب الأفلام من الـ API وعرضها
 */
async function loadMovies(options = {}) {
  showLoading(true);
  
  const query = options.query !== undefined ? options.query : currentSearchQuery;
  const page = options.page || currentPage;
  const sortBy = currentSortBy;
  const genre = currentGenreValue;
  
  let url = `https://yts.bz/api/v2/list_movies.json?limit=20&page=${page}&sort_by=${sortBy}&order_by=${currentSortDirection}`;
  
  if (query) url += `&query_term=${encodeURIComponent(query)}`;
  if (genre) url += `&genre=${encodeURIComponent(genre)}`;
  if (currentRatingValue !== '0') url += `&minimum_rating=${currentRatingValue}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'ok' && data.data.movie_count > 0) {
      totalPages = Math.ceil(data.data.movie_count / 20);
      await displayMovies(data.data.movies);
      renderPagination();
    } else {
      displayNoResults();
    }
  } catch (error) {
    console.error('Error loading movies:', error);
    showNotification('error', 'Failed to load movies.');
  } finally {
    showLoading(false);
  }
}

/**
 * عرض الأفلام في الشبكة مع جلب تقييم IMDb لكل فيلم
 */
async function displayMovies(movies) {
  const moviesGrid = document.getElementById('movies-grid');
  if (!moviesGrid) return;
  
  // جلب تقييمات IMDb بشكل متوازي لسرعة العرض
  const moviesWithImdb = await Promise.all(movies.map(async (movie) => {
    let imdbRating = movie.rating; // القيمة الافتراضية
    if (movie.imdb_code) {
      try {
        const omdbRes = await fetch(`https://www.omdbapi.com/?i=${movie.imdb_code}&apikey=9b8d2c00`);
        const omdbData = await omdbRes.json();
        if (omdbData.Response === "True" && omdbData.imdbRating !== "N/A") {
          imdbRating = omdbData.imdbRating;
        }
      } catch (e) { console.error('OMDb fetch error:', e); }
    }
    return { ...movie, imdbRating };
  }));

  moviesGrid.innerHTML = moviesWithImdb.map(movie => `
    <div class="movie-card" data-id="${movie.id}" onclick="handleCardClick(this, ${movie.id})">
      <div class="movie-poster">
        <img src="${movie.medium_cover_image || createDefaultPosterImage()}" alt="${movie.title}" loading="lazy">
        <div class="movie-rating">
          <i class="fab fa-imdb" style="color: #f5c518;"></i> ${movie.imdbRating}
        </div>
        <div class="poster-buttons-overlay">
          <button class="action-btn-merged">
            <i class="fas fa-play-circle"></i>
          </button>
        </div>
      </div>
      <div class="movie-info">
        <h3 class="movie-title">${movie.title}</h3>
        <p class="movie-year">${movie.year}</p>
      </div>
    </div>
  `).join('');
}

/**
 * معالجة الضغط على بطاقة الفيلم (نظام الضغط المزدوج)
 */
function handleCardClick(cardElement, movieId) {
  // إذا كانت البطاقة نشطة بالفعل (الضغطة الثانية)
  if (cardElement.classList.contains('card-active')) {
    openMovieDetails(movieId);
    cardElement.classList.remove('card-active');
  } else {
    // الضغطة الأولى: تفعيل البطاقة وإظهار الزر
    // إزالة الحالة النشطة من جميع البطاقات الأخرى أولاً
    document.querySelectorAll('.movie-card').forEach(c => c.classList.remove('card-active'));
    cardElement.classList.add('card-active');
    
    // إغلاق الحالة النشطة تلقائياً بعد 3 ثوانٍ إذا لم يتم الضغط مرة أخرى
    setTimeout(() => {
      cardElement.classList.remove('card-active');
    }, 3000);
  }
}

/**
 * عرض رسالة عند عدم وجود نتائج
 */
function displayNoResults() {
  const moviesGrid = document.getElementById('movies-grid');
  const pagination = document.getElementById('pagination');
  if (moviesGrid) {
    moviesGrid.innerHTML = `
      <div class="no-results">
        <i class="fas fa-search"></i>
        <p>No movies found matching your search.</p>
      </div>
    `;
  }
  if (pagination) pagination.innerHTML = '';
}

/**
 * فتح تفاصيل الفيلم
 */
async function openMovieDetails(movieId) {
  const movieDetailsElement = document.getElementById('movie-details');
  movieDetailsElement.innerHTML = `<button class="close-details">&times;</button><div class="loading-details"><div class="spinner"></div></div>`;
  movieDetailsElement.classList.add('active');
  document.body.style.overflow = 'hidden';

  try {
    const response = await fetch(`https://yts.bz/api/v2/movie_details.json?movie_id=${movieId}&with_images=true&with_cast=true`);
    const data = await response.json();
    const movie = data.data.movie;
    
    let omdbData = null;
    if (movie.imdb_code) {
      try {
        const omdbResponse = await fetch(`https://www.omdbapi.com/?i=${movie.imdb_code}&apikey=9b8d2c00&plot=full`);
        if (omdbResponse.ok) {
          omdbData = await omdbResponse.json();
          if (omdbData.Response === "False") omdbData = null;
        }
      } catch (e) { console.error('OMDb API error:', e); }
    }
    
    let html = `<button class="close-details">&times;</button><div class="details-container">`;
    
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
              ${omdbData && omdbData.imdbRating ? `<span><i class="fab fa-imdb" style="color: #f5c518;"></i> ${omdbData.imdbRating}/10</span>` : ''}
            </div>
            <div class="details-genres">
              ${movie.genres ? movie.genres.map(g => `<span class="genre-badge">${g}</span>`).join('') : ''}
            </div>
            <div class="details-actions">
              ${movie.imdb_code ? `<a href="https://www.imdb.com/title/${movie.imdb_code}" target="_blank" class="imdb-link-btn"><i class="fab fa-imdb"></i> View on IMDb</a>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="details-content">
        <div class="details-main">
          <div class="details-section">
            <h3>Storyline</h3>
            <p>${omdbData && omdbData.Plot && omdbData.Plot !== "N/A" ? omdbData.Plot : (movie.description_full || 'No description available.')}</p>
          </div>
          ${omdbData && omdbData.Awards && omdbData.Awards !== "N/A" ? `
            <div class="details-section">
              <h3>Awards</h3>
              <p style="color: var(--rating-color); font-style: italic;"><i class="fas fa-trophy"></i> ${omdbData.Awards}</p>
            </div>
          ` : ''}
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
