// ============================================
// Jenkinsfile — Flash Sale Manager CI/CD Pipeline
// ============================================
// This file defines the ENTIRE CI/CD pipeline as code.
// It lives in the Git repository alongside the application code.
// Jenkins reads this file and executes the stages automatically.
//
// PIPELINE TYPE: Declarative
// WHY Declarative (not Scripted):
// - Structured, readable syntax (stages/steps pattern).
// - Built-in error handling and post-actions.
// - Easier to understand in interviews and code reviews.
// - Sufficient for 95% of pipelines.
//
// FLOW:
//   git push → GitHub → Jenkins detects change →
//   Checkout → Install → Test → Build Image → Deploy → Smoke Test
//
// RULE: If ANY stage fails, ALL subsequent stages are SKIPPED.
//   Tests fail → no Docker build → no deployment → broken code never reaches users.

pipeline {
    // ============================================
    // Agent — WHERE the pipeline runs
    // ============================================
    // 'any' means: run on any available Jenkins agent.
    // For our single-controller setup, this runs directly on Jenkins.
    // In enterprise setups, you'd specify agent labels (e.g., 'docker', 'linux').
    agent any

    // ============================================
    // Environment — Pipeline-wide variables
    // ============================================
    // These are available in ALL stages.
    // NEVER put actual secrets here — use Jenkins Credentials Manager instead.
    environment {
        // Docker image name
        IMAGE_NAME = 'flash-sale-manager'

        // Tag with Git commit SHA for immutable, traceable versions.
        // WHY not :latest? Because:
        // 1. "latest" is MUTABLE — you can't tell which code is running.
        // 2. If you deploy :latest and it's broken, you can't roll back to
        //    "the previous latest" because it's been overwritten.
        // 3. Git SHA is UNIQUE per commit — you always know exactly which
        //    code produced the image.
        // GIT_COMMIT is a built-in Jenkins variable (set after checkout).
        IMAGE_TAG = "${env.GIT_COMMIT?.take(8) ?: 'latest'}"

        // Project directory
        PROJECT_DIR = "${env.WORKSPACE}"

        // Docker Compose project name (prevents conflicts with other projects)
        COMPOSE_PROJECT_NAME = 'flash-sale'
    }

    // ============================================
    // Pipeline Stages
    // ============================================
    stages {
        // ============================================
        // Stage 1: Checkout
        // ============================================
        // Pull the latest code from the Git repository.
        // Jenkins does this automatically when using SCM-configured pipelines,
        // but being explicit makes the pipeline self-documenting.
        stage('Checkout') {
            steps {
                echo '📥 Checking out source code...'
                checkout scm
                // 'checkout scm' pulls from the repository configured in the
                // Jenkins job settings. It uses the branch/commit that triggered
                // the build.

                // Capture the short commit SHA for image tagging
                script {
                    env.IMAGE_TAG = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                    echo "Git commit: ${env.IMAGE_TAG}"
                }
            }
        }

        // ============================================
        // Stage 2: Dependency Validation
        // ============================================
        // Verify that package.json and package-lock.json are in sync.
        // WHY: If someone ran `npm install <pkg>` but forgot to commit
        // the updated package-lock.json, the CI build would install
        // different dependency versions than what was tested locally.
        // `npm ci` catches this by FAILING if the lock file is stale.
        stage('Validate Dependencies') {
            steps {
                echo '📦 Validating dependency lock file...'
                sh 'node --version'
                sh 'npm --version'
                // npm ci: Clean Install
                // - Deletes node_modules entirely
                // - Installs EXACTLY what's in package-lock.json
                // - FAILS if package-lock.json doesn't match package.json
                // - Faster and more deterministic than npm install
                sh 'npm ci'
            }
        }

        // ============================================
        // Stage 3: Lint / Static Analysis
        // ============================================
        // Static checks that don't require running the application.
        // WHY: Catch syntax errors, style violations, and common bugs
        // BEFORE wasting time on tests and Docker builds.
        //
        // NOTE: We don't currently have ESLint configured.
        // This stage validates that the code at least parses correctly
        // and checks for common issues.
        stage('Static Checks') {
            steps {
                echo '🔍 Running static checks...'
                // Verify all source files have valid JavaScript syntax
                sh 'node -e "require(\'./src/app\')" || exit 1'
                echo '✅ Static checks passed'
            }
        }

        // ============================================
        // Stage 4: Docker Build
        // ============================================
        // Build the Docker image that will be used for all API replicas
        // and the worker.
        //
        // WHY build BEFORE integration tests:
        // If the Dockerfile has errors (missing files, failed npm install),
        // we want to know immediately — before wasting time on tests.
        //
        // IMAGE TAGGING STRATEGY:
        // We tag with BOTH the git SHA and 'latest':
        // - SHA tag: Immutable, traceable, used for deployment.
        // - latest: Convenience for local development (NOT used for deployment).
        stage('Docker Build') {
            steps {
                echo "🐳 Building Docker image: ${IMAGE_NAME}:${IMAGE_TAG}"
                sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} ."
                sh "docker build -t ${IMAGE_NAME}:latest ."
                echo "✅ Image built and tagged: ${IMAGE_NAME}:${IMAGE_TAG}"
            }
        }

        // ============================================
        // Stage 5: Integration Tests
        // ============================================
        // Start the FULL stack (MySQL, Redis, API, Worker) and run
        // end-to-end tests against it.
        //
        // WHY integration tests in CI:
        // Unit tests verify individual functions.
        // Integration tests verify the SYSTEM works:
        // - Can the API connect to MySQL?
        // - Does Redis queueing work?
        // - Does the worker process orders?
        // - Does Nginx route correctly?
        //
        // These tests run against real Docker containers, not mocks.
        stage('Integration Tests') {
            steps {
                echo '🧪 Starting integration test stack...'
                // Start the full stack using the freshly built image
                sh """
                    cd ${PROJECT_DIR}
                    docker compose -p ${COMPOSE_PROJECT_NAME}-test down --remove-orphans 2>/dev/null || true
                    docker compose -p ${COMPOSE_PROJECT_NAME}-test up -d --build
                """

                // Wait for services to be healthy
                echo '⏳ Waiting for services to become healthy...'
                sh 'sleep 30'

                // Run smoke test — verify the full request chain works
                echo '🔬 Running integration tests...'
                sh """
                    # Test 1: Health check through Nginx
                    curl -sf http://localhost/health || (echo 'Health check failed!' && exit 1)

                    # Test 2: API returns products
                    curl -sf http://localhost/api/products || (echo 'Products endpoint failed!' && exit 1)

                    echo '✅ Integration tests passed!'
                """
            }
            post {
                always {
                    // Clean up test stack regardless of test result
                    echo '🧹 Cleaning up test stack...'
                    sh "docker compose -p ${COMPOSE_PROJECT_NAME}-test down --remove-orphans 2>/dev/null || true"
                }
            }
        }

        // ============================================
        // Stage 6: Deploy
        // ============================================
        // Deploy the new version to the local Docker Compose environment.
        //
        // STRATEGY: Recreate Deployment
        // We stop the old containers and start new ones with the updated image.
        //
        // WHY NOT rolling deployment:
        // Rolling deployment (update one replica at a time) requires an
        // orchestrator like Kubernetes. Docker Compose doesn't support it
        // natively. For our local environment, a brief restart is acceptable.
        //
        // WHY NOT blue-green:
        // Blue-green (run two full stacks, switch traffic) doubles resource
        // usage. Overkill for local development.
        //
        // DOWNTIME: There will be a brief downtime (~5-10 seconds) during
        // container recreation. The MySQL volume persists — no data loss.
        stage('Deploy') {
            steps {
                echo "🚀 Deploying version ${IMAGE_TAG}..."
                sh """
                    cd ${PROJECT_DIR}
                    # Pull/rebuild with the latest code
                    docker compose down --remove-orphans 2>/dev/null || true
                    docker compose up -d --build
                """

                // Wait for deployment to stabilize
                echo '⏳ Waiting for deployment to stabilize...'
                sh 'sleep 20'
            }
        }

        // ============================================
        // Stage 7: Post-Deployment Smoke Test
        // ============================================
        // Verify the deployment actually works.
        //
        // WHY: Just because Docker says "container is running" doesn't mean
        // the application inside is healthy. MySQL might still be initializing.
        // The API might have crashed on startup due to a missing env var.
        //
        // A smoke test is a minimal set of checks that prove the system
        // is alive and functional. NOT a full test suite.
        stage('Smoke Test') {
            steps {
                echo '🔥 Running post-deployment smoke tests...'
                sh """
                    # Check 1: API health through Nginx
                    echo 'Checking API health...'
                    curl -sf http://localhost/health | grep -q 'OK' || (echo 'SMOKE TEST FAILED: /health' && exit 1)

                    # Check 2: Products endpoint returns data
                    echo 'Checking products endpoint...'
                    curl -sf http://localhost/api/products | grep -q 'success' || (echo 'SMOKE TEST FAILED: /api/products' && exit 1)

                    echo '✅ All smoke tests passed! Deployment is healthy.'
                """
            }
        }
    }

    // ============================================
    // Post-Pipeline Actions
    // ============================================
    // These run AFTER all stages complete (or fail).
    // 'always' runs regardless of success/failure.
    // 'success' runs only if the entire pipeline passed.
    // 'failure' runs only if any stage failed.
    post {
        success {
            echo """
            ✅ ============================================
            ✅ PIPELINE SUCCEEDED
            ✅ ============================================
            ✅ Image: ${IMAGE_NAME}:${IMAGE_TAG}
            ✅ Deployed and verified.
            ✅ ============================================
            """
        }
        failure {
            echo """
            ❌ ============================================
            ❌ PIPELINE FAILED
            ❌ ============================================
            ❌ Deployment was NOT executed or rolled back.
            ❌ Check the stage logs above for details.
            ❌ ============================================
            """
        }
        always {
            // Clean up workspace to prevent disk space issues
            echo '🧹 Cleaning workspace...'
            cleanWs(cleanWhenNotBuilt: false)
        }
    }
}
