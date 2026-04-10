export async function cleanupTestJobs(pool: any, jobId: string) {
    // CORRECT: Targeted delete
    await pool.query('DELETE FROM jobs WHERE id = $1', [jobId]);

    // FORBIDDEN: Nuclear delete (WHERE clause missing or too broad)
}