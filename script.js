document.addEventListener('DOMContentLoaded', () => {
    // Language Switching Logic
    const langToggleBtn = document.getElementById('lang-toggle');
    const body = document.body;

    // Detect browser language
    const userLang = navigator.language || navigator.userLanguage;
    let currentLang = userLang.startsWith('ja') ? 'ja' : 'en';

    function updateLang(lang) {
        if (lang === 'ja') {
            body.classList.add('lang-jp');
            body.classList.remove('lang-en');
            document.documentElement.lang = 'ja';
        } else {
            body.classList.add('lang-en');
            body.classList.remove('lang-jp');
            document.documentElement.lang = 'en';
        }
        currentLang = lang;
        console.log(`Language set to: ${lang}`);
    }

    // Initial set
    updateLang(currentLang);

    // Toggle button handler
    langToggleBtn.addEventListener('click', () => {
        const newLang = currentLang === 'ja' ? 'en' : 'ja';
        updateLang(newLang);
    });

    // Dynamic Link Loading for DarkModePDF
    const linkElement = document.getElementById('link-darkmodepdf');
    const storeLinkFile = 'storelink.txt';

    fetch(storeLinkFile)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.text();
        })
        .then(url => {
            // Trim whitespace/newlines
            const cleanUrl = url.trim();
            if (cleanUrl) {
                linkElement.href = cleanUrl;
                console.log(`Loaded store link: ${cleanUrl}`);
            } else {
                console.warn('storelink.txt was empty.');
                // Fallback or keep default '#'
            }
        })
        .catch(error => {
            console.error('Error fetching storelink.txt:', error);
            // Optional: Disable button or show error text if critical
            // linkElement.href = "https://play.google.com/store/apps/details?id=..."; // Fallback if known
        });

    // Mobile Detection and Layout Application
    function checkMobile() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
        if (isMobile) {
            body.classList.add('is-mobile');
            console.log('Mobile device/view detected.');
        } else {
            body.classList.remove('is-mobile');
            console.log('Desktop view detected.');
        }
    }

    // Run on load and resize
    checkMobile();
    window.addEventListener('resize', checkMobile);
});
