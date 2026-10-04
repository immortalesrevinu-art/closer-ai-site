// Public client config. The publishable (anon) key is designed to be public; RLS protects the data.
// NEVER put a service-role / secret key in this folder.
window.CLOSER_CONFIG = {
  supabaseUrl: "https://gluoubsewrfttjtjmtps.supabase.co",
  supabaseKey: "sb_publishable__Rv3U4EMv60iSmqWdfxUwQ_MgUNwIc2",
  publicData: "../data/", // same site: the public stats JSON
  siteRoot: "../", // path from this page to the public site root (the home-page copy at / overrides this to "")
  appUrl: "https://immortalesrevinu-art.github.io/closer-ai-site/app/", // canonical members-app URL (auth email redirects)
};
