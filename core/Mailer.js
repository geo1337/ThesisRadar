const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendJobAlert(newJobs) {
    if (!newJobs.length) return;

    const highScore = newJobs.filter(j => j.score.score >= 4);
    if (!highScore.length) return; // nur bei relevanten Jobs

    const jobRows = highScore.map(j => `
        <tr>
            <td style="padding:12px;border-bottom:1px solid #eee">
                <a href="${j.url}" style="font-weight:bold;color:#7c6dfa">${j.title}</a><br>
                <span style="color:#888;font-size:12px">${j.company} · ${j.city}</span>
            </td>
            <td style="padding:12px;border-bottom:1px solid #eee;text-align:center; white-space:nowrap;">
                <span style="background:${j.score.score >= 4 ? '#22c55e' : '#eab308'};
                             color:white;padding:2px 8px;border-radius:4px;font-size:12px">
                    Score ${j.score.score}
                </span>
            </td>
            <td style="padding:12px;border-bottom:1px solid #eee;font-size:12px;color:#888; white-space:nowrap;">
                ${j.score.categories.join(', ')}
            </td>
        </tr>
    `).join('');

    await resend.emails.send({
        from:    'ThesisRadar <onboarding@resend.dev>',
        to:      process.env.MAIL_TO,
        subject: `🎓 ${highScore.length} neue relevante Stellen gefunden`,
        html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2 style="color:#7c6dfa">🎓 ThesisRadar — Neue Stellen</h2>
                <p style="color:#666">${new Date().toLocaleDateString('de-DE')} · 
                   ${newJobs.length} gesamt · ${highScore.length} hoch relevant</p>

                <table style="width:100%;border-collapse:collapse">
                    <thead>
                        <tr style="background:#f5f5f5">
                            <th style="padding:10px;text-align:left">Stelle</th>
                            <th style="padding:10px">Score</th>
                            <th style="padding:10px;text-align:left">Tags</th>
                        </tr>
                    </thead>
                    <tbody>${jobRows}</tbody>
                </table>

                <p style="margin-top:24px">
                    <a href="http://localhost:3000" 
                       style="background:#7c6dfa;color:white;padding:10px 20px;
                              border-radius:6px;text-decoration:none">
                        Dashboard öffnen →
                    </a>
                </p>

                <p style="color:#bbb;font-size:11px;margin-top:32px">
                    ThesisRadar · nur neue Jobs mit Score ≥ 4
                </p>
            </div>
        `
    });

    console.log(`📧 E-Mail gesendet: ${highScore.length} Jobs`);
}

module.exports = { sendJobAlert };