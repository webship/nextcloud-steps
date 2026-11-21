@viewer
Feature: The viewers
  As a person looking at their files
  I want pictures, PDF documents and text files to open in the browser
  So that I read them without downloading them

  Scenario: A picture opens in the viewer
    Given "user" has the file "team-photo.png"
    And I am a logged in user with the "user" user
    When I go to the files
    And I open the file "team-photo.png"
    Then the viewer should show the image "team-photo.png"
    When I close the viewer
    Then the file list should show "team-photo.png"

  Scenario: A PDF opens in the viewer with its pages and its text
    Given "user" has the file "annual-report.pdf"
    And I am a logged in user with the "user" user
    When I go to the files
    And I open the file "annual-report.pdf"
    Then the viewer should show the PDF "annual-report.pdf"
    And the PDF should have 2 pages
    And the PDF should show "Annual report 2026"

  Scenario: A text file opens in the text editor
    Given "user" has the file "meeting-notes.md"
    And I am a logged in user with the "user" user
    When I go to the files
    And I open the file "meeting-notes.md"
    Then the viewer should show the text "Meeting notes"
    And the viewer should show the text "Send the minutes"
    When I close the viewer
    Then the file list should show "meeting-notes.md"
