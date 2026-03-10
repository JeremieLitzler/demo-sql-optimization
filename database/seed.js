import { faker } from "@faker-js/faker";
import { createClient } from "@supabase/supabase-js";

// Run with: node --env-file=.env database/seed.js
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PROJECT_SERVICE_ROLE,
);

const BATCH_SIZE = 5_000;
const CONCURRENT_BATCHES = 10;

const logStep = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const logErrorAndExit = (context, error) => {
  console.error(`Error seeding ${context}: [${error.code}] ${error.message}`);
  process.exit(1);
};

/**
 * Inserts a pre-built rows array in batches of BATCH_SIZE, CONCURRENT_BATCHES at a time.
 * Returns collected values for selectField (e.g. "id"), or an empty array if omitted.
 */
const insertInBatches = async (tableName, rows, selectField = null) => {
  const ids = [];
  const total = rows.length;

  for (let i = 0; i < total; i += BATCH_SIZE * CONCURRENT_BATCHES) {
    const wavePromises = [];
    for (let w = 0; w < CONCURRENT_BATCHES; w++) {
      const start = i + w * BATCH_SIZE;
      if (start >= total) break;
      const batch = rows.slice(start, Math.min(start + BATCH_SIZE, total));
      const query = supabase.from(tableName).insert(batch);
      wavePromises.push(selectField ? query.select(selectField) : query);
    }

    const results = await Promise.all(wavePromises);
    for (const { data, error } of results) {
      if (error) logErrorAndExit(tableName, error);
      if (selectField && data) ids.push(...data.map((r) => r[selectField]));
    }

    const done = Math.min(i + BATCH_SIZE * CONCURRENT_BATCHES, total);
    logStep(`  ${tableName}: ${done.toLocaleString()}/${total.toLocaleString()}`);
  }

  return ids;
};

// ─── Seeders ─────────────────────────────────────────────────────────────────

const seedCountries = async () => {
  logStep("Seeding country (250 rows)...");
  const TARGET = 250;
  const seen = new Set();
  const rows = [];

  // Collect unique real ISO alpha-2 codes first
  for (let attempts = 0; rows.length < TARGET && attempts < 10_000; attempts++) {
    const code = faker.location.countryCode("alpha-2");
    if (!seen.has(code)) {
      seen.add(code);
      rows.push({ isocode: code, name: faker.location.country() });
    }
  }

  // Fill any remaining gap with synthetic codes (edge case: faker has ~249 unique codes)
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; rows.length < TARGET; i++) {
    const code = alpha[Math.floor(i / 26)] + alpha[i % 26];
    if (!seen.has(code)) {
      seen.add(code);
      rows.push({ isocode: code, name: `Territory ${code}` });
    }
  }

  const { data, error } = await supabase
    .from("country")
    .insert(rows)
    .select("isocode");
  if (error) logErrorAndExit("country", error);
  logStep(`country seeded (${data.length} rows).`);
  return data.map((r) => r.isocode);
};

const seedDemoUsers = async (count) => {
  logStep(`Seeding demouser (${count.toLocaleString()} rows)...`);
  // Index suffix guarantees uniqueness for username and email
  const rows = Array.from({ length: count }, (_, i) => ({
    username: `${faker.internet.username()}_${i}`,
    email: `u${i}_${faker.internet.email()}`,
    fullname: faker.person.fullName(),
    isactive: faker.datatype.boolean(0.9),
  }));

  const ids = await insertInBatches("demouser", rows, "id");
  logStep(`demouser seeded (${ids.length.toLocaleString()} rows).`);
  return ids;
};

const seedProjects = async (count) => {
  logStep(`Seeding project (${count.toLocaleString()} rows)...`);
  const rows = Array.from({ length: count }, () => ({
    name: faker.commerce.productName(),
    isactive: faker.datatype.boolean(0.85),
  }));

  const numbers = await insertInBatches("project", rows, "number");
  logStep(`project seeded (${numbers.length.toLocaleString()} rows).`);
  return numbers;
};

const seedContractors = async (count, isoCodes) => {
  logStep(`Seeding contractor (${count.toLocaleString()} rows)...`);
  const rows = Array.from({ length: count }, () => {
    const hasAgency = faker.datatype.boolean(0.3);
    return {
      name: faker.company.name(),
      address: faker.location.streetAddress(),
      address2: faker.datatype.boolean(0.2) ? faker.location.secondaryAddress() : null,
      zipcode: faker.location.zipCode(),
      city: faker.location.city(),
      countryisocode: faker.helpers.arrayElement(isoCodes),
      contactemail: faker.internet.email(),
      isemailverified: faker.datatype.boolean(0.6),
      taxid: faker.string.alphanumeric(12).toUpperCase(),
      agencyname: hasAgency ? faker.company.name() : null,
      agencyaddress: hasAgency ? faker.location.streetAddress() : null,
      agencyaddress2:
        hasAgency && faker.datatype.boolean(0.2)
          ? faker.location.secondaryAddress()
          : null,
      agencycountryisocode: hasAgency ? faker.helpers.arrayElement(isoCodes) : null,
      isactive: faker.datatype.boolean(0.9),
    };
  });

  const ids = await insertInBatches("contractor", rows, "id");
  logStep(`contractor seeded (${ids.length.toLocaleString()} rows).`);
  return ids;
};

const seedUserProjectAccess = async (count, userIds, projectNumbers) => {
  logStep(`Seeding userprojectaccess (${count.toLocaleString()} rows)...`);

  // ~65% of users participate; random sampling over a reduced pool produces a natural
  // heavy-tail distribution where many users end up with multiple project links.
  const activeUsers = faker.helpers.arrayElements(
    userIds,
    Math.floor(userIds.length * 0.65),
  );

  const pairs = new Set();
  const rows = [];

  while (rows.length < count) {
    const userid = faker.helpers.arrayElement(activeUsers);
    const projectnumber = faker.helpers.arrayElement(projectNumbers);
    const key = `${userid}:${projectnumber}`;
    if (!pairs.has(key)) {
      pairs.add(key);
      rows.push({ userid, projectnumber, isactive: true });
    }
  }

  await insertInBatches("userprojectaccess", rows);
  logStep(`userprojectaccess seeded (${rows.length.toLocaleString()} rows).`);
};

const seedProjectContractors = async (contractorIds, projectNumbers) => {
  logStep(`Seeding projectcontractor (${contractorIds.length.toLocaleString()} rows)...`);

  // Each contractor appears exactly once (requirement).
  // Since contractorId is unique per row, (projectNumber, contractorId) is always a unique pair —
  // no deduplication needed even if multiple contractors share the same project.
  const rows = contractorIds.map((contractorid) => ({
    projectnumber: faker.helpers.arrayElement(projectNumbers),
    contractorid,
    isactive: faker.datatype.boolean(0.95),
  }));

  await insertInBatches("projectcontractor", rows);
  logStep(`projectcontractor seeded (${rows.length.toLocaleString()} rows).`);
};

/**
 * Streams Assignment rows in waves to avoid allocating 1.7 M objects at once.
 * Returns all inserted IDs for use in InternationalAssignment seeding.
 */
const seedAssignments = async (count) => {
  logStep(`Seeding assignment (${count.toLocaleString()} rows)...`);
  const allIds = [];

  while (allIds.length < count) {
    const wavePromises = [];
    for (let w = 0; w < CONCURRENT_BATCHES; w++) {
      const remaining = count - allIds.length - w * BATCH_SIZE;
      if (remaining <= 0) break;
      const batchSize = Math.min(BATCH_SIZE, remaining);
      const batch = Array.from({ length: batchSize }, () => ({
        notes: faker.datatype.boolean(0.2) ? faker.lorem.sentence() : null,
      }));
      wavePromises.push(supabase.from("assignment").insert(batch).select("id"));
    }

    const results = await Promise.all(wavePromises);
    for (const { data, error } of results) {
      if (error) logErrorAndExit("assignment", error);
      for (const row of data) allIds.push(row.id);
    }
    logStep(`  assignment: ${allIds.length.toLocaleString()}/${count.toLocaleString()}`);
  }

  logStep(`assignment seeded (${allIds.length.toLocaleString()} rows).`);
  return allIds;
};

const seedInternationalAssignments = async (count, assignmentIds, contractorIds) => {
  logStep(`Seeding internationalassignment (${count.toLocaleString()} rows)...`);

  // faker.helpers.arrayElements uses a partial Fisher-Yates shuffle: O(count), not O(total)
  const selectedIds = faker.helpers.arrayElements(assignmentIds, count);
  const rows = selectedIds.map((id) => ({
    id,
    contractorid: faker.helpers.arrayElement(contractorIds),
  }));

  await insertInBatches("internationalassignment", rows);
  logStep(`internationalassignment seeded (${rows.length.toLocaleString()} rows).`);
};

// ─── Orchestration ────────────────────────────────────────────────────────────

const seedDatabase = async () => {
  const isoCodes = await seedCountries();

  // DemoUser and Project have no mutual dependency — seed in parallel
  const [userIds, projectNumbers] = await Promise.all([
    seedDemoUsers(9_297),
    seedProjects(7_189),
  ]);

  const contractorIds = await seedContractors(72_374, isoCodes);

  // UserProjectAccess and ProjectContractor are independent — seed in parallel
  await Promise.all([
    seedUserProjectAccess(10_531, userIds, projectNumbers),
    seedProjectContractors(contractorIds, projectNumbers),
  ]);

  const assignmentIds = await seedAssignments(1_700_661);
  await seedInternationalAssignments(31_465, assignmentIds, contractorIds);

  logStep("Database seeded successfully!");
};

seedDatabase().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
