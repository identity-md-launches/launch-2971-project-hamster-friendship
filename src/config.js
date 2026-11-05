/* Owner configuration. Public values only. Never put a service-role key here.
   Apply migrations 001–004 in order; enable Ethereum Web3 Auth.
   Existing projects apply only migrations not already applied. See supabase/README.md.
   Empty values deliberately keep the cloud features off; guest play still works. */
window.HAMSTER_CONFIG = Object.freeze({
  supabaseUrl: '',
  supabasePublishableKey: ''
});
