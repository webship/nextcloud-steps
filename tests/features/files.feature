@files
Feature: Files
  As a person keeping files on the server
  I want to upload, organise, delete and restore them, and mark my favorites
  So that my files are where I expect them

  @critical
  Scenario: A file is uploaded
    Given I am a logged in user with the "user" user
    When I go to the files
    And I upload the file "meeting-notes.md"
    Then the file list should show "meeting-notes.md"

  Scenario: A folder is made and opened
    Given I am a logged in user with the "user" user
    When I go to the files
    And I create the folder "Project files"
    Then a message "Created new folder" should pop up
    When I open the folder "Project files"
    Then the file list should be empty
    When I upload the file "team-photo.png"
    Then the file list should show "team-photo.png"

  Scenario: A file is renamed
    Given "user" has the file "budget.txt"
    And I am a logged in user with the "user" user
    When I go to the files
    And I rename "budget.txt" to "budget-2027.txt"
    Then the file list should show "budget-2027.txt"
    And the file list should not show "budget.txt"

  Scenario: A file is moved into a folder
    Given "user" has the folder "Project files"
    And "user" has the file "team-photo.png"
    And I am a logged in user with the "user" user
    When I go to the files
    And I move "team-photo.png" to the folder "Project files"
    Then the file list should not show "team-photo.png"
    When I open the folder "Project files"
    Then the file list should show "team-photo.png"

  Scenario: A file is copied into a folder in a folder
    Given "user" has the folder "Project files/Reports"
    And "user" has the file "annual-report.pdf"
    And I am a logged in user with the "user" user
    When I go to the files
    And I copy "annual-report.pdf" to the folder "Project files/Reports"
    Then the file list should show "annual-report.pdf"
    When I go to the folder "Project files/Reports"
    Then the file list should show "annual-report.pdf"

  Scenario: A deleted file is restored from the deleted files
    Given "user" has the file "budget.txt"
    And I am a logged in user with the "user" user
    When I go to the files
    And I delete "budget.txt"
    Then a message "Delete file: done" should pop up
    And the file list should not show "budget.txt"
    When I go to the deleted files
    Then the deleted files should list "budget.txt"
    When I restore "budget.txt" from the deleted files
    Then the deleted files should not list "budget.txt"
    When I go to the files
    Then the file list should show "budget.txt"

  Scenario: A favorite is listed in the favorites view
    Given "user" has the file "meeting-notes.md"
    And I am a logged in user with the "user" user
    When I go to the files
    And I add "meeting-notes.md" to the favorites
    Then "meeting-notes.md" should be marked as a favorite
    When I open the "Favorites" files view
    Then the file list should show "meeting-notes.md"
    When I go to the files
    And I remove "meeting-notes.md" from the favorites
    Then "meeting-notes.md" should not be marked as a favorite

  Scenario: The details of a file and its activity
    Given "user" has the file "meeting-notes.md"
    And I am a logged in user with the "user" user
    When I go to the files
    And I open the details of "meeting-notes.md"
    Then the details should show "meeting-notes.md"
    And the details should show "User"
    When I open the "Activity" tab of the details
    Then the details tab should show "You created meeting-notes.md"
    When I close the details
    Then the file list should show "meeting-notes.md"
