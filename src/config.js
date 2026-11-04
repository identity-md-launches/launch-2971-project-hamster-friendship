/* Owner configuration. Public values only. Never put a service-role key here.
   Apply supabase/migrations/001_friendship.sql and enable anonymous Auth first.
   Empty values deliberately keep the cloud features off; guest play still works. */
window.HAMSTER_CONFIG = Object.freeze({
  supabaseUrl: '',
  supabasePublishableKey: ''
});
