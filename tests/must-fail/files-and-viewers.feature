@must-fail
Feature: Assertions that must fail: files, sharing and the viewers
  Each scenario asserts something that is not true on the test site. Its last step must fail, with the message its
  description announces and a hint; the steps before it pass. tests/check-must-fail.js runs them.

  Scenario: A file the list does not show
    Fails with: The file list does not show "no-such-file.txt".
    Given "user" has the file "budget.txt"
    And I am a logged in user with the "user" user
    When I go to the files
    Then the file list should show "no-such-file.txt"

  Scenario: A file that is no favorite
    Fails with: "budget.txt" is not marked as a favorite.
    Given "user" has the file "budget.txt"
    And I am a logged in user with the "user" user
    When I go to the files
    Then "budget.txt" should be marked as a favorite

  Scenario: A file in the deleted files that was never deleted
    Fails with: The deleted files do not list "budget.txt".
    Given "user" has the file "budget.txt"
    And I am a logged in user with the "user" user
    When I go to the deleted files
    Then the deleted files should list "budget.txt"

  Scenario: A share that is not there
    Fails with: "budget.txt" is not shared with Editor.
    Given "user" has the file "budget.txt"
    And I am a logged in user with the "user" user
    When I go to the files
    Then "budget.txt" should be shared with "editor"

  Scenario: A picture taken for a PDF
    Fails with: The viewer shows no PDF
    Given "user" has the file "team-photo.png"
    And I am a logged in user with the "user" user
    When I go to the files
    And I open the file "team-photo.png"
    Then the viewer should show the PDF "team-photo.png"

  Scenario: A PDF with another number of pages
    Fails with: The PDF has 2 page(s), not 3.
    Given "user" has the file "annual-report.pdf"
    And I am a logged in user with the "user" user
    When I go to the files
    And I open the file "annual-report.pdf"
    Then the PDF should have 3 pages

  Scenario: A text the document does not have
    Fails with: The text in the viewer does not have "Quarterly figures".
    Given "user" has the file "meeting-notes.md"
    And I am a logged in user with the "user" user
    When I go to the files
    And I open the file "meeting-notes.md"
    Then the viewer should show the text "Quarterly figures"
