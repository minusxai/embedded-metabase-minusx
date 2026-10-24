const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.METABASE_JWT_SHARED_SECRET = "local-test-secret";
process.env.MX_JWT_SHARED_SECRET = "local-second-secret";
process.env.PROXY_URL = "http://localhost:9091";
const app = require("../server");

const server = app.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(base + "/", { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/dashboard");
    response = await fetch(base + "/dashboard");
    assert.equal(response.status, 200);
    assert((await response.text()).includes("<iframe"));
    response = await fetch(base + "/sso/metabase", { redirect: "manual" });
    assert.equal(response.status, 302);
    const url = new URL(response.headers.get("location"));
    assert(
      jwt.verify(
        url.searchParams.get("jwt"),
        process.env.METABASE_JWT_SHARED_SECRET
      )
    );
    assert(
      jwt.verify(
        url.searchParams.get("mx_jwt"),
        process.env.MX_JWT_SHARED_SECRET
      )
    );
    console.log(
      "HTTP redirects, dashboard rendering and SSO verification passed"
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
