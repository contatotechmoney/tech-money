import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import { pendingReviews, recordReview, reviewContext, reviewInput, reviewRepository, ReviewError } from "./professional-review";
import { QUESTOES } from "./suitability";
import { assignmentClientId, assignmentChangeInput, assignmentManagement } from "./assignment-management";

export function registerProfessionalReviewRoutes(app: Express, requireAuth: RequestHandler) {
  app.get("/api/investments/review-pending", requireAuth, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { res.json(await pendingReviews(req.userId!)); }
    catch { res.status(503).json({ error: "REVIEW_PENDING_UNAVAILABLE" }); }
  });
  app.get("/api/investments/review-access", requireAuth, async (req, res) => {
    try {
      const [assignments, canManageAssignments] = await Promise.all([
        reviewRepository.assignments(req.userId!), assignmentManagement.canManage(req.userId!),
      ]);
      res.set("Cache-Control", "no-store").json({ assignments, canManageAssignments });
    }
    catch { res.status(503).json({ error: "REVIEW_ACCESS_UNAVAILABLE" }); }
  });
  const requireAssignmentAdmin: RequestHandler = async (req, res, next) => {
    try {
      if (!await assignmentManagement.canManage(req.userId!))
        return void res.status(403).json({ error: "ASSIGNMENT_ADMIN_REQUIRED" });
      res.set("Cache-Control", "no-store");
      next();
    } catch { res.status(503).json({ error: "ASSIGNMENT_MANAGEMENT_UNAVAILABLE" }); }
  };
  const managementError = (res: import("express").Response, error: unknown) => {
    if (error instanceof ReviewError) return res.status(error.status).json({ error: error.message });
    return res.status(503).json({ error: "ASSIGNMENT_MANAGEMENT_UNAVAILABLE" });
  };
  app.get("/api/investments/assignment-management", requireAuth, requireAssignmentAdmin, async (req, res) => {
    try { res.json(await assignmentManagement.overview(req.userId!)); }
    catch (error) { managementError(res, error); }
  });
  app.get("/api/investments/assignment-management/clients/:clientId/history", requireAuth, requireAssignmentAdmin, async (req, res) => {
    const clientId = assignmentClientId.safeParse(req.params.clientId);
    if (!clientId.success) return res.status(400).json({ error: "INVALID_ASSIGNMENT_CLIENT" });
    try { res.json(await assignmentManagement.history(req.userId!, clientId.data)); }
    catch (error) { managementError(res, error); }
  });
  for (const action of ["grant", "revoke"] as const) {
    app.post(`/api/investments/assignment-management/${action}`, requireAuth, requireAssignmentAdmin, async (req, res) => {
      // Browser cross-site forms cannot submit this privileged operation as JSON.
      if (!req.is("application/json")) return res.status(415).json({ error: "ASSIGNMENT_JSON_REQUIRED" });
      const input = assignmentChangeInput.safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: "INVALID_ASSIGNMENT", details: input.error.flatten() });
      try { res.status(action === "grant" ? 201 : 200).json(await assignmentManagement.change(req.userId!, action, input.data)); }
      catch (error) { managementError(res, error); }
    });
  }
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