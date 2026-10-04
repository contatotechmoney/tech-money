import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import { recordReview, reviewContext, reviewInput, reviewRepository, ReviewError } from "./professional-review";
import { QUESTOES } from "./suitability";

export function registerProfessionalReviewRoutes(app: Express, requireAuth: RequestHandler) {
  app.get("/api/investments/review-access", requireAuth, async (req, res) => {
    try { res.json({ assignments: await reviewRepository.assignments(req.userId!) }); }
    catch { res.status(503).json({ error: "REVIEW_ACCESS_UNAVAILABLE" }); }
  });
  app.get("/api/investments/review-clients/:clientId/reports", requireAuth, async (req, res) => {
    try {
      if (!await reviewRepository.authorized(req.userId!, req.params.clientId))
        return res.status(403).json({ error: "CONSULTANT_NOT_AUTHORIZED" });
      const reports = await storage.listReports(req.params.clientId);
      const documents = await Promise.all(reports.map(async report => {
        const context = await reviewContext(report);
        return { ...report, ...context.presentation, reportVersion: context.reportVersion,
          profileVersion: context.profileVersion, profile: context.profile, reviews: context.reviews };
      }));
      res.json({ reports: documents, questionnaire: QUESTOES });
    } catch { res.status(503).json({ error: "REVIEW_DATA_UNAVAILABLE" }); }
  });
  app.post("/api/investments/review-clients/:clientId/reports/:reportId/reviews", requireAuth, async (req, res) => {
    try {
      // Check scope before parsing, never accept identity supplied by the browser.
      if (!await reviewRepository.authorized(req.userId!, req.params.clientId))
        return res.status(403).json({ error: "CONSULTANT_NOT_AUTHORIZED" });
      const input = reviewInput.safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: "INVALID_REVIEW", details: input.error.flatten() });
      const review = await recordReview(req.userId!, req.params.clientId, req.params.reportId, input.data);
      res.status(201).json({ review });
    } catch (error) {
      if (error instanceof ReviewError) return res.status(error.status).json({ error: error.message });
      res.status(503).json({ error: "REVIEW_SAVE_UNAVAILABLE" });
    }
  });
}