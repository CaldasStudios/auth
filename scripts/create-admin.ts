// Usage: npm run admin:create -- <email> <password> <name>
// Creates a user (or reuses an existing one) and gives it the admin role.
import { auth } from "../src/auth.ts";

const [email, password, ...nameParts] = process.argv.slice(2);
if (!email || !password || nameParts.length === 0) {
  console.error("Usage: npm run admin:create -- <email> <password> <name>");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

const ctx = await auth.$context;
let user = (await ctx.internalAdapter.findUserByEmail(email))?.user;
if (!user) {
  const hash = await ctx.password.hash(password);
  user = await ctx.internalAdapter.createUser({ email, name: nameParts.join(" "), emailVerified: true }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
}
await ctx.internalAdapter.updateUser(user.id, { role: "admin" });
console.log(`Admin ready: ${email}`);
process.exit(0);
