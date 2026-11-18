# Nexovolt website

A lightweight static multi-page website for Nexovolt. No build system or runtime dependency is required.

## Pages

- index.html is the homepage.
- services.html, products.html, and industries.html describe the engineering services and applications.
- case-studies.html explains the evidence standard; it does not claim completed case studies.
- resources.html identifies planned topics, not published articles.
- tools.html is an assessment-preparation guide.
- contact.html lists contact channels. The online form is deliberately disabled until a secure endpoint and approved privacy and lead-routing details are in place.
- privacy.html describes the website behavior currently implemented.
- 404.html is the not-found page.

## Shared files and assets

- nexovolt.css contains the site styles.
- nexovolt.js handles navigation, progressive reveals, theme selection, and the copyright year.
- nexovolt-theme-init.js applies the saved or automatic theme before the page renders.
- assets/ contains the optimized logo and favicon.

## Editing and publishing

Edit the HTML and shared CSS/JavaScript directly. Keep page links relative so the site works from a project subpath as well as a domain root.

Before publishing, confirm the production domain and project base path. Check that the relative canonical tags resolve to the intended pages, then add a complete social preview image URL and an absolute-URL sitemap.xml for that host. The current robots.txt permits crawling but intentionally does not guess a sitemap host.

Do not enable the enquiry fields until an HTTPS POST endpoint, server-side validation, spam protection, privacy terms, consent handling, lead routing, and receipt/error states have been configured and verified.

Original logo files are preserved under assets/source/. Superseded CSS and JavaScript copies are preserved under _archive/Redundancy/.
