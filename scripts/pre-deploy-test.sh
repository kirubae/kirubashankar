#!/bin/bash
# Pre-deployment test script
# Run this before any deployment to verify everything works

echo "=========================================="
echo "       PRE-DEPLOYMENT TEST SUITE         "
echo "=========================================="
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# 1. Build Test
echo "1. Building project..."
if npm run build > /dev/null 2>&1; then
    echo "   ✅ npm run build: PASS"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "   ❌ npm run build: FAIL"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 2. Check dist output
echo ""
echo "2. Checking build output..."
if [ -f "dist/index.html" ]; then
    echo "   ✅ dist/index.html exists: PASS"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "   ❌ dist/index.html exists: FAIL"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

if [ -f "dist/_routes.json" ]; then
    echo "   ✅ dist/_routes.json exists: PASS"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "   ❌ dist/_routes.json exists: FAIL"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 3. Check SSR routes are included
echo ""
echo "3. Checking SSR routes..."
if grep -q "/tools/share" dist/_routes.json 2>/dev/null; then
    echo "   ✅ /tools/share in routes: PASS"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "   ❌ /tools/share in routes: FAIL"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 4. Check compatibility_date
echo ""
echo "4. Checking wrangler config..."
if grep -q "2024-12-01" wrangler.jsonc 2>/dev/null; then
    echo "   ✅ compatibility_date is correct: PASS"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "   ❌ compatibility_date is correct: FAIL"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Summary
echo ""
echo "=========================================="
echo "               SUMMARY                    "
echo "=========================================="
echo ""
echo "   Tests Passed: $TESTS_PASSED"
echo "   Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "✅ ALL TESTS PASSED - Ready to deploy"
    exit 0
else
    echo "❌ SOME TESTS FAILED - DO NOT DEPLOY"
    exit 1
fi
