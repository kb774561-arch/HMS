// Runs only when a Vercel project is (wrongly) built from the repo root.
console.error(`
*** Wrong Root Directory ***
This repo holds two Vercel projects. In Vercel > Project > Settings > Build and Deployment,
set "Root Directory" to:
  backend   for the API project (hmsapi)
  frontend  for the website project (hms)
then redeploy.
`);
process.exit(1);
